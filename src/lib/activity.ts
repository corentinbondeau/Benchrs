import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type ActivityAction =
  | "match.score"
  | "attendance.update"
  | "match.report"
  | "match.event"
  | "event.convocation";

const ACTION_LABELS: Record<ActivityAction, string> = {
  "match.score": "Score",
  "attendance.update": "Présence",
  "match.report": "Compte-rendu",
  "match.event": "Live",
  "event.convocation": "Convocation",
};

export function activityActionLabel(action: string): string {
  return ACTION_LABELS[action as ActivityAction] || action;
}

/**
 * Ajoute une ligne au journal d'activité du club/équipe.
 * RLS : l'insertion est autorisée pour tout membre visible de l'équipe.
 */
export async function logActivity(params: {
  supabase?: SupabaseClient;
  teamId: string;
  clubId?: string | null;
  userId?: string | null;
  actionType: ActivityAction | string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = params.supabase ?? createClient();
  const { error } = await supabase.from("activity_logs").insert({
    club_id: params.clubId || null,
    team_id: params.teamId,
    user_id: params.userId || null,
    action_type: params.actionType,
    description: params.description,
    metadata: params.metadata || null,
  });
  if (error) {
    // Le journal ne doit jamais bloquer l'action principale
    console.error("[activity] log failed:", error.message);
  }
}
