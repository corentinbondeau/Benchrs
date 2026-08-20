"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { toast } from "sonner";

interface EducatorRow {
  id: string;
  event_id: string;
  exercise_index: number | null;
  educator: { id: string; first_name: string; last_name: string } | null;
}

interface CoachMember {
  id: string;
  first_name: string;
  last_name: string;
}

export interface ExerciseSlot {
  index: number;
  label: string;
}

export function ExerciseEducators({
  eventId,
  teamId,
  isCoach,
  exercises,
}: {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  exercises: ExerciseSlot[];
}) {
  const [plans, setPlans] = useState<EducatorRow[]>([]);
  const [coaches, setCoaches] = useState<CoachMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    const supabase = createClient();

    // 1. Fetch educator assignments for this event
    const plansRes = await supabase
      .from("educator_plans")
      .select("id, event_id, exercise_index, user_id")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    // 2. Fetch coach/owner user_ids for this team
    const membersRes = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["coach", "owner"]);

    const coachUserIds = [...new Set((membersRes.data || []).map((m) => m.user_id as string))];

    // 3. Collect all user_ids that need profile lookup (coaches + assigned educators)
    const planRows = (plansRes.data || []) as { id: string; event_id: string; exercise_index: number | null; user_id: string }[];
    const allUserIds = [...new Set([...coachUserIds, ...planRows.map((p) => p.user_id)])];

    // 4. Fetch profiles for all relevant users in one call
    let profileMap = new Map<string, CoachMember>();
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", allUserIds);
      for (const p of (profiles || []) as CoachMember[]) {
        profileMap.set(p.id, p);
      }
    }

    // 5. Build coach list from profiles
    const coaches = coachUserIds
      .map((uid) => profileMap.get(uid))
      .filter((p): p is CoachMember => !!p);

    // 6. Build educator plans with resolved profiles
    const plans: EducatorRow[] = planRows.map((p) => ({
      id: p.id,
      event_id: p.event_id,
      exercise_index: p.exercise_index,
      educator: profileMap.get(p.user_id) ?? null,
    }));

    return { plans, coaches };
  }, [eventId, teamId]);

  useEffect(() => {
    if (!eventId || !teamId) return;
    fetchPlans().then((res) => {
      setPlans(res.plans);
      setCoaches(res.coaches);
      setLoading(false);
    });
  }, [eventId, teamId, fetchPlans]);

  async function refresh() {
    const res = await fetchPlans();
    setPlans(res.plans);
    setCoaches(res.coaches);
  }

  async function assignEducator(index: number, userId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("educator_plans").upsert(
      {
        team_id: teamId,
        user_id: userId,
        event_id: eventId,
        exercise_index: index,
        role: "responsable",
      },
      { onConflict: "team_id,event_id,exercise_index" }
    );
    if (error) {
      toast.error("Impossible d'assigner le responsable");
      return;
    }
    toast.success("Responsable de l'exercice mis à jour");
    refresh();
  }

  async function removeEducator(index: number) {
    const supabase = createClient();
    const { error } = await supabase
      .from("educator_plans")
      .delete()
      .eq("event_id", eventId)
      .eq("exercise_index", index);
    if (error) {
      toast.error("Impossible de retirer le responsable");
      return;
    }
    toast.success("Responsable retiré");
    refresh();
  }

  const assignmentByIndex = new Map<number, EducatorRow>(
    plans
      .filter((p) => p.exercise_index != null)
      .map((p) => [p.exercise_index as number, p])
  );

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-[var(--color-royal)]" />
          Répartition des éducateurs
        </p>
        {loading ? (
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
        ) : (
          <div className="space-y-2">
            {exercises.map((ex) => {
              const plan = assignmentByIndex.get(ex.index);
              const educator = plan?.educator;
              return (
                <div
                  key={ex.index}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="flex-1 min-w-0 truncate text-sm">
                    <span className="font-medium text-muted-foreground mr-1.5">
                      {ex.index + 1}.
                    </span>
                    {ex.label || "Exercice"}
                  </span>
                  {isCoach ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        className="h-8 max-w-[180px] rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={educator?.id ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v) assignEducator(ex.index, v);
                          else removeEducator(ex.index);
                        }}
                      >
                        <option value="">Aucun responsable</option>
                        {coaches.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.first_name} {c.last_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {educator
                        ? `${educator.first_name} ${educator.last_name}`
                        : "Pas de responsable"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
