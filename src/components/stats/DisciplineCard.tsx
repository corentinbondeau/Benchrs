"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { AlertTriangle, Ban, Loader2, ShieldAlert, Plus, Trash2, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Suspension } from "@/types";
import { currentSeasonLabel, seasonDateRange } from "@/lib/goals";

const YELLOW_THRESHOLD = 3;

export function DisciplineCard({
  playerId,
  playerName,
  teamId,
  isCoach,
}: {
  playerId: string;
  playerName: string;
  teamId: string;
  isCoach: boolean;
}) {
  const [yellows, setYellows] = useState(0);
  const [reds, setReds] = useState(0);
  const [suspensions, setSuspensions] = useState<Suspension[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [matches, setMatches] = useState("1");
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const season = currentSeasonLabel();
  const range = seasonDateRange(season);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [statsRes, suspRes] = await Promise.all([
      supabase
        .from("match_stats")
        .select("yellow_cards, red_cards, event_id")
        .eq("player_id", playerId)
        .eq("team_id", teamId),
      supabase.from("suspensions").select("*").eq("player_id", playerId).eq("team_id", teamId).order("created_at", { ascending: false }),
    ]);
    return { stats: (statsRes.data || []) as { yellow_cards: number; red_cards: number; event_id: string }[], suspensions: (suspRes.data || []) as Suspension[] };
  }, [playerId, teamId]);

  useEffect(() => {
    loadData().then(async ({ stats, suspensions }) => {
      setSuspensions(suspensions);
      setLoading(false);
      if (!range || stats.length === 0) {
        setYellows(0);
        setReds(0);
        return;
      }
      const supabase = createClient();
      const eventIds = stats.map((s) => s.event_id);
      const { data: events } = await supabase
        .from("events")
        .select("id, event_date")
        .in("id", eventIds);
      const dates = new Map((events || []).map((e) => [(e as { id: string }).id, (e as { event_date: string }).event_date]));
      let y = 0;
      let r = 0;
      for (const s of stats) {
        const d = dates.get(s.event_id);
        if (!d) continue;
        const dt = new Date(d);
        if (dt >= range.start && dt <= range.end) {
          y += s.yellow_cards || 0;
          r += s.red_cards || 0;
        }
      }
      setYellows(y);
      setReds(r);
    });
  }, [loadData, range]);

  async function addSuspension() {
    if (!reason.trim()) {
      toast.error("Motif requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("suspensions").insert({
        player_id: playerId,
        team_id: teamId,
        reason: reason.trim(),
        matches_count: parseInt(matches) || 1,
        start_date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      const reload = await loadData();
      setSuspensions(reload.suspensions);
      setOpen(false);
      setReason("");
      setMatches("1");
      toast.success("Suspension enregistrée");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeSuspension(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("suspensions").delete().eq("id", id);
    if (error) {
      toast.error(String(error.message));
      return;
    }
    setSuspensions((prev) => prev.filter((s) => s.id !== id));
  }

  async function notifyPlayer() {
    setNotifying(true);
    try {
      const supabase = createClient();
      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", teamId)
        .eq("student_id", playerId);
      const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
      const userIds = [...new Set([playerId, ...parentIds])];
      const warning = yellows >= YELLOW_THRESHOLD || reds > 0;
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: userIds,
          title: warning ? "Alerte discipline ⚠️" : "Point discipline",
          body: warning
            ? `${playerName} est à ${yellows} cartons jaunes${reds ? ` et ${reds} carton(s) rouge(s)` : ""} cette saison. Attention à la suspension.`
            : `${playerName} : ${yellows} carton(s) jaune(s) cette saison. Continue à faire attention sur les tacles !`,
          type: "suspension",
          reference_id: playerId,
          team_id: teamId,
          url: `/stats/${playerId}`,
        }),
      });
      toast.success("Alerte envoyée au joueur et aux parents");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setNotifying(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const warning = yellows >= YELLOW_THRESHOLD || reds > 0;
  const almost = !warning && yellows === YELLOW_THRESHOLD - 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[var(--color-gold)]" />
          Discipline ({season})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className={`text-2xl font-bold ${warning ? "text-red-500" : almost ? "text-amber-500" : ""}`}>{yellows}</p>
            <p className="text-xs text-muted-foreground">Cartons jaunes</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3 text-center">
            <p className={`text-2xl font-bold ${reds > 0 ? "text-red-600" : ""}`}>{reds}</p>
            <p className="text-xs text-muted-foreground">Cartons rouges</p>
          </div>
        </div>

        {warning && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {yellows >= YELLOW_THRESHOLD
              ? `Suspension proche : ${yellows} cartons jaunes (seuil ${YELLOW_THRESHOLD}).`
              : "Carton rouge reçu cette saison."}
          </div>
        )}
        {almost && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Plus qu&apos;un carton jaune avant suspension ({yellows}/{YELLOW_THRESHOLD}).
          </div>
        )}

        {suspensions.length > 0 && (
          <div className="space-y-1.5">
            {suspensions.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    <Ban className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    {s.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.matches_count} match(s){s.start_date ? ` · depuis le ${new Date(s.start_date).toLocaleDateString("fr-FR")}` : ""}
                  </p>
                </div>
                {isCoach && (
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeSuspension(s.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {isCoach && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => setOpen(true)}>
              <Plus className="h-3 w-3 mr-1" />
              Ajouter une suspension
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={notifyPlayer} disabled={notifying}>
              {notifying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Bell className="h-3 w-3 mr-1" />}
              Alerter le joueur
            </Button>
          </div>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter une suspension</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Motif (ex: 3e carton jaune, coup de pied...)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm"
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={matches}
                onChange={(e) => setMatches(e.target.value)}
                className="text-sm w-24"
              />
              <span className="text-sm text-muted-foreground">match(s) de suspension</span>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button size="sm" onClick={addSuspension} disabled={saving || !reason.trim()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
