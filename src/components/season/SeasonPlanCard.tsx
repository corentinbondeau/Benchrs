"use client";

import { useCallback, useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, CalendarRange, Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { SeasonPlan } from "@/lib/seasonPlan";
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
          <Sparkles className="h-4 w-4 text-[var(--color-gold)]" />
          Préparation de saison IA — {season}
        </CardTitle>
        <CardDescription>
          Génère un planning périodisé complet (cycles, dates, axes de travail) puis crée les cycles dans le calendrier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!plan ? (
          isCoach ? (
            <Button
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold w-full"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {generating ? "Génération en cours…" : "Générer le plan de saison"}
            </Button>
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
              <div className="flex gap-2">
                <Button onClick={handleApply} disabled={applying || plan.phases.length === 0}>
                  {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                  Créer les cycles
                </Button>
                <Button variant="outline" onClick={handleGenerate} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                  Régénérer
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
