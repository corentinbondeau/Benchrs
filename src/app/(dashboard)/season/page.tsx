"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarRange,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  Clock,
  Sprout,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

type CycleType = "preparation" | "competition" | "athletisation";

interface SeasonCycle {
  id: string;
  team_id: string;
  name: string;
  cycle_type: CycleType;
  start_date: string;
  end_date: string;
  notes: string | null;
  season: string | null;
}

const CYCLE_TYPES: { value: CycleType; label: string; icon: typeof Sprout; color: string }[] = [
  { value: "preparation", label: "Préparation", icon: Sprout, color: "text-emerald-600 bg-emerald-50" },
  { value: "competition", label: "Compétition", icon: Trophy, color: "text-amber-600 bg-amber-50" },
  { value: "athletisation", label: "Athlétisation", icon: Zap, color: "text-sky-600 bg-sky-50" },
];

function typeMeta(t: CycleType) {
  return CYCLE_TYPES.find((c) => c.value === t) || CYCLE_TYPES[0];
}

function cycleProgress(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

export default function SeasonPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [cycles, setCycles] = useState<SeasonCycle[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SeasonCycle | null>(null);
  const [name, setName] = useState("");
  const [cycleType, setCycleType] = useState<CycleType>("preparation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentTeam) return null;
    const supabase = createClient();
    const [cyclesRes, eventsRes] = await Promise.all([
      supabase
        .from("season_cycles")
        .select("id, team_id, name, cycle_type, start_date, end_date, notes, season")
        .eq("team_id", currentTeam.id)
        .order("start_date", { ascending: true }),
      supabase.from("events").select("id, cycle_id").eq("team_id", currentTeam.id).not("cycle_id", "is", null),
    ]);

    const ids = (cyclesRes.data || []).map((c) => c.id);
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = 0;
    for (const ev of eventsRes.data || []) {
      const cid = ev.cycle_id as string;
      if (cid in counts) counts[cid] += 1;
    }
    return { cycles: (cyclesRes.data as SeasonCycle[]) || [], counts };
  }, [currentTeam?.id]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (!cancelled && res) {
        setCycles(res.cycles);
        setEventCounts(res.counts);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  function openCreate() {
    setEditing(null);
    setName("");
    setCycleType("preparation");
    setStartDate("");
    setEndDate("");
    setNotes("");
    setOpen(true);
  }

  function openEdit(c: SeasonCycle) {
    setEditing(c);
    setName(c.name);
    setCycleType(c.cycle_type);
    setStartDate(c.start_date.slice(0, 10));
    setEndDate(c.end_date.slice(0, 10));
    setNotes(c.notes || "");
    setOpen(true);
  }

  async function refresh() {
    const res = await loadData();
    if (res) {
      setCycles(res.cycles);
      setEventCounts(res.counts);
    }
  }

  async function handleSave() {
    if (!currentTeam) return;
    if (!name.trim()) return toast.error("Donne un nom au cycle");
    if (!startDate || !endDate) return toast.error("Renseigne les dates de début et de fin");
    if (new Date(endDate) < new Date(startDate)) return toast.error("La fin doit être après le début");
    setSaving(true);
    const supabase = createClient();
    const payload = {
      team_id: currentTeam.id,
      name: name.trim(),
      cycle_type: cycleType,
      start_date: startDate,
      end_date: endDate,
      notes: notes.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("season_cycles").update(payload).eq("id", editing.id)
      : await supabase.from("season_cycles").insert({ ...payload, created_by: user?.id });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erreur lors de l'enregistrement");
      return;
    }
    toast.success(editing ? "Cycle mis à jour" : "Cycle créé");
    setOpen(false);
    refresh();
  }

  async function handleDelete(c: SeasonCycle) {
    if (!confirm(`Supprimer le cycle « ${c.name} » ?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("season_cycles").delete().eq("id", c.id);
    if (error) {
      toast.error(error.message || "Erreur lors de la suppression");
      return;
    }
    toast.success("Cycle supprimé");
    refresh();
  }

  const currentCycle = cycles.find((c) => {
    const p = cycleProgress(c.start_date, c.end_date);
    return p > 0 && p < 100;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-[var(--color-royal)]" />
            Plan de saison
          </h1>
          <p className="text-sm text-muted-foreground">
            Découpe la saison en cycles : préparation, compétition, athlétisation.
          </p>
        </div>
        {isCoach && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nouveau cycle
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-10">Chargement…</p>
      ) : cycles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun cycle défini. {isCoach ? "Crée le premier pour structurer la saison." : "Le coach peut structurer la saison."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {currentCycle && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-[var(--color-royal)]" />
                  <p className="text-sm font-medium">Cycle en cours : {currentCycle.name}</p>
                  <Badge variant="secondary">{typeMeta(currentCycle.cycle_type).label}</Badge>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--color-royal)] transition-all"
                    style={{ width: `${cycleProgress(currentCycle.start_date, currentCycle.end_date)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {cycleProgress(currentCycle.start_date, currentCycle.end_date)}% du cycle écoulé
                </p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {cycles.map((c) => {
              const meta = typeMeta(c.cycle_type);
              const Icon = meta.icon;
              const progress = cycleProgress(c.start_date, c.end_date);
              const count = eventCounts[c.id] || 0;
              return (
                <Card key={c.id}>
                  <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{c.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {c.season || "Saison"} ·{" "}
                          {new Date(c.start_date + "T00:00:00").toLocaleDateString("fr-FR")} →{" "}
                          {new Date(c.end_date + "T00:00:00").toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>
                    {isCoach && (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-600"
                          onClick={() => handleDelete(c)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline">{meta.label}</Badge>
                    {count > 0 && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {count} événement{count > 1 ? "s" : ""} rattaché{count > 1 ? "s" : ""}
                      </span>
                    )}
                    {c.notes && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{c.notes}</p>}
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
                      <div
                        className={`h-full rounded-full ${progress === 100 ? "bg-green-500" : "bg-[var(--color-royal)]"}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {progress === 100 ? "Terminé" : `${progress}% écoulé`}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le cycle" : "Nouveau cycle"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nom du cycle</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Pré-saison 1, Phase aller…" />
            </div>
            <div className="space-y-1.5">
              <Label>Type de cycle</Label>
              <Select value={cycleType} onValueChange={(v) => setCycleType(v as CycleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CYCLE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Début</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fin</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optionnel)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Objectifs du cycle, consignes, etc."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
