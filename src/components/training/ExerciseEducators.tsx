"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
    const profileMap = new Map<string, CoachMember>();
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

    // Tenter la RPC atomique (migration 091) ; si elle n'existe pas ou
    // échoue, retomber sur le pattern DELETE+INSERT classique.
    const { error: rpcError } = await supabase.rpc("upsert_educator_plan", {
      p_team_id: teamId,
      p_event_id: eventId,
      p_exercise_index: index,
      p_user_id: userId,
      p_role: "responsable",
    });

    if (rpcError) {
      console.warn("[educator_plans] rpc failed, fallback DELETE+INSERT:", rpcError.message);

      // Fallback : DELETE puis INSERT (non atomique mais fonctionnel)
      await supabase
        .from("educator_plans")
        .delete()
        .eq("team_id", teamId)
        .eq("event_id", eventId)
        .eq("exercise_index", index);

      const { error: insertError } = await supabase.from("educator_plans").insert({
        team_id: teamId,
        user_id: userId,
        event_id: eventId,
        exercise_index: index,
        role: "responsable",
      });

      if (insertError) {
        console.error("[educator_plans] insert error:", insertError.message, insertError.code, insertError.details);
        toast.error(`Impossible d'assigner le responsable : ${insertError.message}`);
        return;
      }
    }

    toast.success("Responsable de l'exercice mis à jour");
    refresh();
  }

  async function removeEducator(index: number) {
    const supabase = createClient();
    const { error } = await supabase
      .from("educator_plans")
      .delete()
      .eq("team_id", teamId)
      .eq("event_id", eventId)
      .eq("exercise_index", index);
    if (error) {
      console.error("[educator_plans] delete error:", error.message, error.code, error.details);
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
    <div className="rounded-xl border border-[var(--color-royal)]/20 bg-[var(--color-navy)]/5 p-4">
      <p className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-[var(--color-navy)]">
        <Users className="h-4 w-4 text-[var(--color-royal)]" />
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
                className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2"
              >
                <span className="flex-1 min-w-0 truncate text-sm">
                  <span className="font-semibold text-[var(--color-royal)] mr-1.5">
                    {ex.index + 1}.
                  </span>
                  {ex.label || "Exercice"}
                </span>
                {isCoach ? (
                  <select
                    className="flex h-9 w-full max-w-full rounded-lg border border-[var(--color-royal)]/30 bg-background px-3 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                    value={educator?.id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) assignEducator(ex.index, v);
                      else removeEducator(ex.index);
                    }}
                  >
                    <option value="">— Choisir —</option>
                    {coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                      </option>
                    ))}
                  </select>
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
    </div>
  );
}
