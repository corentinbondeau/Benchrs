"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Check, Eye, Lock, Plus, Target, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  GOAL_CATEGORIES,
  currentSeasonLabel,
  goalCategoryInfo,
  previousSeasonLabel,
  seasonDateRange,
} from "@/lib/goals";
import type { GoalCategory, PersonalGoal } from "@/types";
import { computeAttendanceRate } from "@/lib/attendance/computeAttendanceRate";

interface Props {
  playerId: string;
}

interface SeasonProgress {
  goals: number;
  assists: number;
  matches: number;
  minutes: number;
  assiduite: number;
}

const EMPTY_PROGRESS: SeasonProgress = {
  goals: 0,
  assists: 0,
  matches: 0,
  minutes: 0,
  assiduite: 0,
};

export function PersonalGoalsCard({ playerId }: Props) {
  const { currentTeam, userRole } = useTeam();
  const { user } = useAuth();
  const isPlayerSelf = user?.id === playerId;
  const isCoach = userRole === "coach" || userRole === "owner";

  const [goals, setGoals] = useState<PersonalGoal[]>([]);
  const [progress, setProgress] = useState<SeasonProgress>(EMPTY_PROGRESS);
  const [season, setSeason] = useState(() => currentSeasonLabel());
  const [knownSeasons, setKnownSeasons] = useState<string[]>([]);
  const [isParent, setIsParent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    category: "goals" as GoalCategory,
    label: "",
    target: "",
    notes: "",
  });

  const loadSeason = useCallback(
    async (
      pid: string,
      teamId: string,
      season: string
    ): Promise<{ goals: PersonalGoal[]; progress: SeasonProgress; seasons: string[] }> => {
      const supabase = createClient();
      const [goalsRes, seasonsRes] = await Promise.all([
        supabase
          .from("personal_goals")
          .select("*")
          .eq("player_id", pid)
          .eq("team_id", teamId)
          .eq("season", season),
        supabase
          .from("personal_goals")
          .select("season")
          .eq("player_id", pid)
          .eq("team_id", teamId),
      ]);

      const goals = (goalsRes.data as PersonalGoal[]) || [];
      const seasons = [
        ...new Set((seasonsRes.data || []).map((r) => (r as { season: string }).season)),
      ];

      const range = seasonDateRange(season);
      let progress = EMPTY_PROGRESS;
      if (range) {
        const { data: events } = await supabase
          .from("events")
          .select("id")
          .eq("team_id", teamId)
          .gte("event_date", range.start.toISOString())
          .lte("event_date", range.end.toISOString());
        const eventIds = (events || []).map((e) => e.id);

        const { data: trainingEvents } = await supabase
          .from("events")
          .select("id")
          .eq("team_id", teamId)
          .eq("type", "training")
          .gte("event_date", range.start.toISOString())
          .lte("event_date", range.end.toISOString());
        const trainingIds = (trainingEvents || []).map((e) => e.id as string);

        if (eventIds.length > 0 || trainingIds.length > 0) {
          const [{ data: stats }, { data: atts }] = await Promise.all([
            eventIds.length > 0
              ? supabase
                  .from("match_stats")
                  .select("event_id, goals, assists, minutes_played")
                  .eq("player_id", pid)
                  .eq("team_id", teamId)
                  .in("event_id", eventIds)
              : Promise.resolve({ data: [] as unknown[] }),
            trainingIds.length > 0
              ? supabase
                  .from("attendances")
                  .select("status, event_id")
                  .eq("user_id", pid)
                  .eq("team_id", teamId)
                  .in("event_id", trainingIds)
              : Promise.resolve({ data: [] as unknown[] }),
          ]);

          let goals = 0;
          let assists = 0;
          let minutes = 0;
          const matchEvents = new Set<string>();
          for (const s of stats || []) {
            const row = s as { event_id: string; goals: number; assists: number; minutes_played: number };
            goals += row.goals || 0;
            assists += row.assists || 0;
            minutes += row.minutes_played || 0;
            matchEvents.add(row.event_id);
          }
          const attendanceRows = (atts || []) as { status: string; event_id: string }[];
          const attendanceRate = computeAttendanceRate(attendanceRows, trainingIds);
          progress = {
            goals,
            assists,
            matches: matchEvents.size,
            minutes,
            assiduite: attendanceRate ?? 0,
          };
        }
      }

      return { goals, progress, seasons };
    },
    []
  );

  useEffect(() => {
    if (!currentTeam) return;
    const teamId = currentTeam.id;
    let cancelled = false;
    loadSeason(playerId, teamId, season).then((res) => {
      if (cancelled) return;
      setGoals(res.goals);
      setProgress(res.progress);
      setKnownSeasons(res.seasons);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentTeam, playerId, season, loadSeason]);

  useEffect(() => {
    if (!currentTeam || !user?.id) return;
    const supabase = createClient();
    supabase
      .from("parent_student")
      .select("id")
      .eq("parent_id", user.id)
      .eq("student_id", playerId)
      .eq("team_id", currentTeam.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsParent(!!data);
      });
  }, [currentTeam, playerId, user?.id]);

  const seasons = useMemo(() => {
    const current = currentSeasonLabel();
    const set = new Set<string>([
      ...knownSeasons,
      current,
      previousSeasonLabel(current),
      previousSeasonLabel(previousSeasonLabel(current)),
    ]);
    return [...set].sort().reverse();
  }, [knownSeasons]);

  async function reload() {
    if (!currentTeam) return;
    const res = await loadSeason(playerId, currentTeam.id, season);
    setGoals(res.goals);
    setProgress(res.progress);
    setKnownSeasons(res.seasons);
  }

  async function saveGoal() {
    if (!currentTeam) return;
    const category = form.category;
    const label =
      form.label.trim() || (category !== "other" ? goalCategoryInfo(category).label : "");
    const target = parseFloat(form.target);
    if (!label) {
      toast.error("Renseigne un libellé pour cet objectif");
      return;
    }
    if (isNaN(target) || target <= 0) {
      toast.error("Objectif invalide (doit être un nombre positif)");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("personal_goals").insert({
      player_id: playerId,
      team_id: currentTeam.id,
      season,
      category,
      label,
      target,
      notes: form.notes.trim() || null,
    });
    setSaving(false);

    if (error) {
      toast.error("Erreur lors de l'enregistrement de l'objectif");
      return;
    }

    await reload();
    setAdding(false);
    setForm({ category: "goals", label: "", target: "", notes: "" });
    toast.success("Objectif ajouté !");
  }

  async function deleteGoal(goal: PersonalGoal) {
    if (!currentTeam) return;
    const supabase = createClient();
    const { error } = await supabase.from("personal_goals").delete().eq("id", goal.id);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    await reload();
    toast.success("Objectif supprimé");
  }

  const canView = isPlayerSelf || isCoach || isParent;
  const canManage = isPlayerSelf;
  const categoryInfo = goalCategoryInfo(form.category);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Target className="h-4 w-4 text-[var(--color-gold)]" />
          Objectifs personnels
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!canView ? (
          <div className="text-center py-4">
            <Lock className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Les objectifs personnels ne sont visibles que par le joueur, ses parents et les coachs.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                Visible par toi, tes parents et les coachs
              </p>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs transition-colors"
              >
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    Saison {s}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-lg bg-muted" />
                <div className="h-16 animate-pulse rounded-lg bg-muted" />
              </div>
            ) : goals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {canManage
                  ? "Aucun objectif pour cette saison. Fixe-toi un but à atteindre !"
                  : "Aucun objectif pour cette saison."}
              </p>
            ) : (
              <div className="space-y-3">
                {goals.map((goal) => {
                  const info = goalCategoryInfo(goal.category);
                  const value = goal.category === "other" ? null : progress[goal.category];
                  const pct = value !== null ? Math.min(100, Math.round((value / goal.target) * 100)) : null;
                  const reached = pct !== null && pct >= 100;
                  return (
                    <div key={goal.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{goal.label}</p>
                          <Badge variant="secondary" className="text-[10px] mt-0.5">
                            {info.label}
                          </Badge>
                        </div>
                        {canManage && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteGoal(goal)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {value !== null ? (
                        <>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                reached ? "bg-green-500" : "bg-[var(--color-gold)]"
                              }`}
                              style={{ width: `${pct ?? 0}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {value} / {goal.target} {info.unit}
                            {reached && <span className="text-green-600 font-medium"> · Objectif atteint !</span>}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Objectif : {goal.target}
                        </p>
                      )}
                      {goal.notes && <p className="text-xs text-muted-foreground">{goal.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {canManage &&
              (adding ? (
                <div className="mt-4 rounded-lg border p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Catégorie</Label>
                      <select
                        value={form.category}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            category: e.target.value as GoalCategory,
                            label: e.target.value === "other" ? f.label : "",
                          }))
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors"
                      >
                        {GOAL_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Objectif</Label>
                      <Input
                        type="number"
                        min="1"
                        value={form.target}
                        onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                        placeholder={form.category === "assiduite" ? "Ex: 90" : "Ex: 10"}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Libellé {form.category === "other" ? "" : "(optionnel)"}
                    </Label>
                    <Input
                      value={form.label}
                      onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                      placeholder={
                        form.category === "other"
                          ? "Ex: Progresser au jeu de tête"
                          : categoryInfo.label
                      }
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Note (optionnel)</Label>
                    <Textarea
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Ex: En travaillant les coups de pied arrêtés..."
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">{categoryInfo.hint}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-[var(--color-primary-blue)] text-white font-semibold"
                      onClick={saveGoal}
                      disabled={saving}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                      <X className="h-3.5 w-3.5 mr-1" />
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Ajouter un objectif
                </Button>
              ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
