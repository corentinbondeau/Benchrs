"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, X } from "lucide-react";
import { toast } from "sonner";

interface EducatorPlanRow {
  id: string;
  event_id: string;
  role: string | null;
  notes: string | null;
  educator: { id: string; first_name: string; last_name: string } | null;
}

interface CoachMember {
  id: string;
  first_name: string;
  last_name: string;
}

export function EducatorPlans({
  eventId,
  teamId,
  isCoach,
}: {
  eventId: string;
  teamId: string;
  isCoach: boolean;
}) {
  const [plans, setPlans] = useState<EducatorPlanRow[]>([]);
  const [coaches, setCoaches] = useState<CoachMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlans = useCallback(async () => {
    const supabase = createClient();
    const [plansRes, coachesRes] = await Promise.all([
      supabase
        .from("educator_plans")
        .select(
          "id, event_id, role, notes, educator:profiles!educator_plans_user_id_fkey(id, first_name, last_name)"
        )
        .eq("event_id", eventId),
      supabase
        .from("team_members")
        .select("user_id, profile:profiles!team_members_user_id_fkey(id, first_name, last_name)")
        .eq("team_id", teamId)
        .in("role", ["coach", "owner"]),
    ]);
    const coachRows = (coachesRes.data || []) as unknown as { user_id: string; profile: { id: string; first_name: string; last_name: string } | null }[];
    const coaches = coachRows
      .map((c) => c.profile)
      .filter((p): p is CoachMember => !!p)
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
    return {
      plans: (plansRes.data || []) as unknown as EducatorPlanRow[],
      coaches,
    };
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

  async function assignEducator(userId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("educator_plans").upsert(
      {
        team_id: teamId,
        user_id: userId,
        event_id: eventId,
      },
      { onConflict: "team_id,event_id,user_id" }
    );
    if (error) {
      toast.error("Impossible d'assigner l'éducateur");
      return;
    }
    toast.success("Éducateur assigné à la séance");
    refresh();
  }

  async function removeEducator(planId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("educator_plans").delete().eq("id", planId);
    if (error) {
      toast.error("Impossible de retirer l'éducateur");
      return;
    }
    toast.success("Éducateur retiré");
    refresh();
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-royal)] border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  const assignedIds = new Set(plans.map((p) => p.educator?.id));
  const availableCoaches = coaches.filter((c) => !assignedIds.has(c.id));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--color-royal)]" />
          Éducateurs de la séance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {plans.length === 0 && !isCoach && (
          <p className="text-sm text-muted-foreground text-center py-3">
            Aucun éducateur assigné à cette séance.
          </p>
        )}
        {plans.length === 0 && isCoach && (
          <p className="text-sm text-muted-foreground text-center py-3">
            Assignez les éducateurs qui encadrent cette séance.
          </p>
        )}
        {plans.length > 0 && (
          <div className="space-y-2">
            {plans.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate font-medium">
                  {p.educator?.first_name} {p.educator?.last_name}
                </span>
                {p.role && (
                  <span className="text-xs text-muted-foreground">{p.role}</span>
                )}
                {isCoach && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeEducator(p.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {isCoach && (
          <div className="mt-3 space-y-2">
            {availableCoaches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Tous les éducateurs sont déjà assignés.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableCoaches.map((c) => (
                  <Button
                    key={c.id}
                    variant="outline"
                    size="sm"
                    onClick={() => assignEducator(c.id)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    {c.first_name} {c.last_name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
