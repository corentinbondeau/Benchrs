"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { HeartPulse, Plus, Stethoscope, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Injury } from "@/types";

export function MedicalRecordCard({
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
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: "",
    injuryType: "",
    injuryDate: new Date().toISOString().slice(0, 10),
    expectedReturn: "",
  });

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("injuries")
      .select("*")
      .eq("player_id", playerId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    return (data as Injury[]) || [];
  }, [playerId, teamId]);

  useEffect(() => {
    loadData().then((list) => {
      setInjuries(list);
      setLoading(false);
    });
  }, [loadData]);

  async function addInjury(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) {
      toast.error("Description requise");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("injuries")
        .insert({
          player_id: playerId,
          team_id: teamId,
          description: form.description.trim(),
          injury_type: form.injuryType || null,
          injury_date: form.injuryDate,
          expected_return: form.expectedReturn || null,
          status: "active",
          reported_by: null,
        })
        .select()
        .single();
      if (error) throw error;
      const list = await loadData();
      setInjuries(list);
      setOpen(false);
      setForm({ description: "", injuryType: "", injuryDate: new Date().toISOString().slice(0, 10), expectedReturn: "" });
      toast.success("Blessure signalée");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function markRecovered(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("injuries").update({ status: "recovered" }).eq("id", id);
    if (error) {
      toast.error(String(error.message));
      return;
    }
    const list = await loadData();
    setInjuries(list);
    toast.success("Blessure marquée comme récupérée");
  }

  const active = injuries.filter((i) => i.status === "active");
  const recovered = injuries.filter((i) => i.status === "recovered");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <HeartPulse className="h-4 w-4 text-red-500" />
            Dossier médical
          </span>
          {isCoach && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" className="h-7 text-xs" />}>
                <Plus className="h-3 w-3 mr-1" />
                Signaler
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Signaler une blessure — {playerName}</DialogTitle>
                </DialogHeader>
                <form onSubmit={addInjury} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Description *</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="Ex: Entorse cheville gauche lors de l'entraînement..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Input
                      value={form.injuryType}
                      onChange={(e) => setForm({ ...form, injuryType: e.target.value })}
                      placeholder="Ex: Entorse, claquage, tendinite..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={form.injuryDate}
                        onChange={(e) => setForm({ ...form, injuryDate: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Retour prévu</Label>
                      <Input
                        type="date"
                        value={form.expectedReturn}
                        onChange={(e) => setForm({ ...form, expectedReturn: e.target.value })}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-[var(--color-primary-blue)] text-white font-semibold" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Signaler
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : active.length === 0 && recovered.length === 0 ? (
          <div className="flex flex-col items-center py-4 text-center text-muted-foreground">
            <Stethoscope className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Aucun antécédent médical enregistré</p>
          </div>
        ) : (
          <>
            {active.map((injury) => (
              <div key={injury.id} className="rounded-lg border border-red-200 bg-red-50/60 dark:bg-red-950/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">
                        {injury.injury_type || "Blessure"}
                      </Badge>
                      {injury.expected_return && (
                        <span className="text-xs text-red-700 dark:text-red-300">
                          Retour prévu : {new Date(injury.expected_return).toLocaleDateString("fr-FR")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1.5">{injury.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Depuis le {new Date(injury.injury_date).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  {isCoach && (
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => markRecovered(injury.id)}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Récupéré
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {recovered.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Antécédents</p>
                {recovered.slice(0, 5).map((injury) => (
                  <div key={injury.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        {injury.injury_type || "Blessure"} — {injury.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(injury.injury_date).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
