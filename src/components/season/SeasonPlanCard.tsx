"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Loader2,
  CalendarRange,
  Check,
  RefreshCw,
  PenLine,
  Plus,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import type { SeasonPlan, SeasonPlanPhase } from "@/lib/seasonPlan";
import { currentSeasonLabel } from "@/lib/goals";

const TYPE_LABELS: Record<string, string> = {
  "DÉSEQUILIBRER / FINIR": "Déséquilibrer / Finir",
  "CONSERVER / PROGRESSER": "Conserver / Progresser",
  "S'OPPOSER À LA PROGRESSION": "S'opposer",
  "S'ORGANISER POUR RECUPERER": "Récupérer",
  ATHLETISATION: "Athlétisation",
};

export function SeasonPlanCard({
  teamId,
  isCoach,
  onApplied,
}: {
  teamId: string;
  isCoach: boolean;
  onApplied: () => void;
}) {
  const [plan, setPlan] = useState<SeasonPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [season] = useState(currentSeasonLabel());
  const [editing, setEditing] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [draft, setDraft] = useState<SeasonPlan>({
    title: "",
    overview: "",
    phases: [{ name: "", cycle_type: TACTICAL_PHASE_NAMES[0], start_date: "", end_date: "", focus: "", weekly_plan: [] }],
  });

  const loadPlan = useCallback(async () => {
    const res = await authFetch(`/api/season/plan?teamId=${teamId}&season=${season}`);
    if (!res.ok) return null;
    const json = await res.json();
    return (json.plan as SeasonPlan) ?? null;
  }, [teamId, season]);

  useEffect(() => {
    let cancelled = false;
    loadPlan().then((p) => {
      if (!cancelled) setPlan(p);
    });
    return () => {
      cancelled = true;
    };
  }, [loadPlan]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await authFetch("/api/season/plan", {
        method: "POST",
        body: JSON.stringify({ teamId, season }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setPlan(json.plan);
      toast.success(json.cached ? "Plan chargé" : "Plan de saison généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de génération");
    } finally {
      setGenerating(false);
    }
  }

  function startEditing() {
    setDraft(plan ? { ...plan, phases: plan.phases.map((p) => ({ ...p, weekly_plan: [...p.weekly_plan] })) } : { title: "", overview: "", phases: [{ name: "", cycle_type: TACTICAL_PHASE_NAMES[0], start_date: "", end_date: "", focus: "", weekly_plan: [] }] });
    setEditing(true);
  }

  function updatePhase(i: number, field: keyof SeasonPlanPhase, value: string) {
    setDraft((d) => {
      const phases = [...d.phases];
      phases[i] = { ...phases[i], [field]: value };
      return { ...d, phases };
    });
  }

  async function handleSaveManual() {
    const phases = draft.phases.filter(
      (p) => p.name.trim() && p.start_date && p.end_date
    );
    if (phases.length === 0) {
      toast.error("Ajoute au moins un cycle complet (nom + dates)");
      return;
    }
    setSavingManual(true);
    try {
      const supabase = createClient();
      const saved: SeasonPlan = {
        title: draft.title.trim() || "Plan de saison",
        overview: draft.overview.trim(),
        phases: phases.map((p) => ({ ...p, name: p.name.trim(), focus: p.focus.trim() })),
      };
      const { error } = await supabase
        .from("season_plans")
        .upsert(
          { team_id: teamId, season, content: saved as unknown as Record<string, unknown>, created_by: null },
          { onConflict: "team_id,season" }
        );
      if (error) throw error;
      setPlan(saved);
      setEditing(false);
      toast.success("Plan de saison enregistré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSavingManual(false);
    }
  }

  async function handleApply() {
    if (!plan || plan.phases.length === 0) return;
    setApplying(true);
    const supabase = createClient();
    let inserted = 0;
    let skipped = 0;
    try {
      for (const phase of plan.phases) {
        const { data: existing } = await supabase
          .from("season_cycles")
          .select("id")
          .eq("team_id", teamId)
          .eq("name", phase.name)
          .maybeSingle();
        if (existing) {
          skipped += 1;
          continue;
        }
        const { error } = await supabase.from("season_cycles").insert({
          team_id: teamId,
          name: phase.name,
          cycle_type: phase.cycle_type,
          start_date: phase.start_date,
          end_date: phase.end_date,
          notes: phase.focus || null,
          season,
        });
        if (error) throw error;
        inserted += 1;
      }
      toast.success(`${inserted} cycle(s) créé(s)${skipped > 0 ? `, ${skipped} déjà existant(s)` : ""}`);
      onApplied();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création des cycles");
    } finally {
      setApplying(false);
    }
  }

  if (!plan && !isCoach) return null;

  return (
    <Card className="border-[var(--color-gold)]/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-[var(--color-gold)]" />
          Préparation de saison — {season}
        </CardTitle>
        <CardDescription>
          Génére un planning périodisé complet par IA ou rédige-le à la main (cycles, dates, axes de travail), puis crée les cycles dans le calendrier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing && isCoach ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Titre du plan</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Plan de saison 2025-2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Vue d&apos;ensemble (optionnel)</Label>
              <Textarea
                value={draft.overview}
                onChange={(e) => setDraft((d) => ({ ...d, overview: e.target.value }))}
                placeholder="Résumé du plan en 2-3 phrases..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Cycles</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      phases: [...d.phases, { name: "", cycle_type: TACTICAL_PHASE_NAMES[0], start_date: "", end_date: "", focus: "", weekly_plan: [] }],
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un cycle
                </Button>
              </div>
              {draft.phases.map((phase, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 flex-1"
                      value={phase.name}
                      onChange={(e) => updatePhase(i, "name", e.target.value)}
                      placeholder="Nom du cycle"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => setDraft((d) => ({ ...d, phases: d.phases.filter((_, j) => j !== i) }))}
                      disabled={draft.phases.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={phase.cycle_type}
                        onChange={(e) => updatePhase(i, "cycle_type", e.target.value)}
                      >
                        {TACTICAL_PHASE_NAMES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Axe de travail</Label>
                      <Input
                        className="h-8"
                        value={phase.focus}
                        onChange={(e) => updatePhase(i, "focus", e.target.value)}
                        placeholder="Ex : relance courte"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Début</Label>
                      <Input
                        type="date"
                        className="h-8"
                        value={phase.start_date}
                        onChange={(e) => updatePhase(i, "start_date", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Fin</Label>
                      <Input
                        type="date"
                        className="h-8"
                        value={phase.end_date}
                        onChange={(e) => updatePhase(i, "end_date", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                onClick={handleSaveManual}
                disabled={savingManual}
              >
                {savingManual ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Enregistrer le plan
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={savingManual}>
                <X className="h-4 w-4 mr-1" /> Annuler
              </Button>
            </div>
          </div>
        ) : !plan ? (
          isCoach ? (
            <div className="space-y-2">
              <Button
                className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold w-full"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {generating ? "Génération en cours…" : "Générer le plan de saison"}
              </Button>
              <Button variant="outline" className="w-full" onClick={startEditing}>
                <PenLine className="h-4 w-4 mr-1" />
                Rédiger le plan à la main
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun plan de saison généré par le coach.</p>
          )
        ) : (
          <>
            <div>
              <p className="text-sm font-bold">{plan.title}</p>
              {plan.overview && <p className="text-xs text-muted-foreground mt-1">{plan.overview}</p>}
            </div>
            <div className="space-y-2">
              {plan.phases.map((phase) => (
                <div key={phase.name} className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <CalendarRange className="h-3.5 w-3.5 text-[var(--color-royal)]" />
                      {phase.name}
                    </p>
                    <Badge variant="outline">{TYPE_LABELS[phase.cycle_type] || phase.cycle_type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(phase.start_date + "T00:00:00").toLocaleDateString("fr-FR")} →{" "}
                    {new Date(phase.end_date + "T00:00:00").toLocaleDateString("fr-FR")}
                  </p>
                  {phase.focus && <p className="text-xs mt-1">{phase.focus}</p>}
                  {phase.weekly_plan.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {phase.weekly_plan.map((w, i) => (
                        <li key={i} className="text-xs text-muted-foreground list-disc list-inside">{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {isCoach && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleApply} disabled={applying || plan.phases.length === 0}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                  Créer les cycles
                </Button>
                <Button variant="outline" onClick={startEditing}>
                  <PenLine className="h-4 w-4 mr-1" />
                  Modifier à la main
                </Button>
                <Button variant="outline" onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Régénérer par IA
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
