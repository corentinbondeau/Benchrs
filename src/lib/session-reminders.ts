import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AttendanceRow {
  user_id: string;
  status: string | null;
}

export interface RpeRow {
  player_id: string;
  rpe: number | null;
}

export interface FeedbackRow {
  player_id: string;
  rating: number | null;
}

export interface MissingResponder {
  userId: string;
  missingRpe: boolean;
  missingFeedback: boolean;
}

const EXPECTED_STATUSES = new Set(["present", "late"]);

/**
 * Logique pure : détermine, parmi les joueurs attendus (présents/en retard
 * ET profil actif), lesquels n'ont pas rempli leur RPE et/ou leur analyse
 * de séance (feedback). Un joueur est "manquant" dès qu'il lui manque l'un
 * OU l'autre.
 */
export function computeMissingResponders(params: {
  attendances: AttendanceRow[];
  rpeRows: RpeRow[];
  feedbackRows: FeedbackRow[];
  activePlayerIds: string[];
}): MissingResponder[] {
  const { attendances, rpeRows, feedbackRows, activePlayerIds } = params;

  const activeSet = new Set(activePlayerIds);

  const expectedIds = [
    ...new Set(
      attendances
        .filter((a) => a.status && EXPECTED_STATUSES.has(a.status))
        .map((a) => a.user_id)
        .filter((id) => activeSet.has(id))
    ),
  ];

  const rpeByPlayer = new Map<string, number | null>();
  for (const row of rpeRows) {
    rpeByPlayer.set(row.player_id, row.rpe);
  }

  const feedbackByPlayer = new Map<string, number | null>();
  for (const row of feedbackRows) {
    feedbackByPlayer.set(row.player_id, row.rating);
  }

  const result: MissingResponder[] = [];
  for (const userId of expectedIds) {
    const missingRpe = rpeByPlayer.get(userId) == null;
    const missingFeedback = feedbackByPlayer.get(userId) == null;
    if (missingRpe || missingFeedback) {
      result.push({ userId, missingRpe, missingFeedback });
    }
  }

  return result;
}

interface EventRow {
  id: string;
  team_id: string | null;
  type: string;
  event_date: string;
}

interface NotificationRow {
  user_id: string;
  team_id: string | null;
  type: string;
  title: string;
  body: string;
  reference_id: string;
  url: string;
  scheduled_for: string;
}

/**
 * Calcule et insère les notifications de relance combinée (RPE + analyse de
 * séance) pour tous les entraînements passés éligibles. Retourne le nombre
 * de notifications insérées.
 */
export async function sendSessionReminders(
  supabase: SupabaseClient | ReturnType<typeof createAdminClient>,
  now: string
): Promise<number> {
  const nowDate = new Date(now);

  const { data: eventsData } = await supabase
    .from("events")
    .select("id, team_id, type, event_date")
    .eq("type", "training")
    .lt("event_date", now);

  const events = ((eventsData || []) as EventRow[]).filter(
    (e) => e.type === "training" && new Date(e.event_date) < nowDate
  );

  if (events.length === 0) return 0;

  const teamIds = [...new Set(events.map((e) => e.team_id).filter(Boolean) as string[])];

  const { data: settingsData } = await supabase
    .from("team_settings")
    .select("team_id, rpe_reminders_enabled")
    .in("team_id", teamIds);

  const disabledTeams = new Set(
    ((settingsData || []) as { team_id: string; rpe_reminders_enabled: boolean }[])
      .filter((s) => s.rpe_reminders_enabled === false)
      .map((s) => s.team_id)
  );

  const allRows: NotificationRow[] = [];

  for (const ev of events) {
    if (!ev.team_id) continue;
    if (disabledTeams.has(ev.team_id)) continue;

    const { data: attendancesData } = await supabase
      .from("attendances")
      .select("user_id, status")
      .eq("event_id", ev.id)
      .in("status", ["present", "late"]);

    const attendances = (attendancesData || []) as AttendanceRow[];
    if (attendances.length === 0) continue;

    const { data: rpeData } = await supabase
      .from("session_rpe")
      .select("player_id, rpe")
      .eq("event_id", ev.id);

    const { data: feedbackData } = await supabase
      .from("session_feedback")
      .select("player_id, rating")
      .eq("event_id", ev.id);

    const candidateIds = [...new Set(attendances.map((a) => a.user_id))];

    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id")
      .in("id", candidateIds)
      .eq("is_active", true);

    const activePlayerIds = ((profilesData || []) as { id: string }[]).map((p) => p.id);

    const missing = computeMissingResponders({
      attendances,
      rpeRows: (rpeData || []) as RpeRow[],
      feedbackRows: (feedbackData || []) as FeedbackRow[],
      activePlayerIds,
    });

    if (missing.length === 0) continue;

    const missingIds = missing.map((m) => m.userId);

    const { data: parentLinksData } = await supabase
      .from("parent_student")
      .select("parent_id, student_id")
      .eq("team_id", ev.team_id)
      .in("student_id", missingIds);

    const parentsByStudent = new Map<string, string[]>();
    for (const link of (parentLinksData || []) as { parent_id: string; student_id: string }[]) {
      const list = parentsByStudent.get(link.student_id) || [];
      list.push(link.parent_id);
      parentsByStudent.set(link.student_id, list);
    }

    const recipientIds = new Set<string>();
    for (const m of missing) {
      recipientIds.add(m.userId);
      for (const parentId of parentsByStudent.get(m.userId) || []) {
        recipientIds.add(parentId);
      }
    }

    const refIds = [...recipientIds].map((uid) => `seance-relance:${ev.id}:${uid}`);

    const { data: existingData } = await supabase
      .from("notifications")
      .select("reference_id")
      .eq("type", "relance_seance")
      .in("reference_id", refIds);

    const existingRefs = new Set(
      ((existingData || []) as { reference_id: string }[]).map((n) => n.reference_id)
    );

    for (const uid of recipientIds) {
      const referenceId = `seance-relance:${ev.id}:${uid}`;
      if (existingRefs.has(referenceId)) continue;
      allRows.push({
        user_id: uid,
        team_id: ev.team_id,
        type: "relance_seance",
        title: "Analyse de séance à compléter",
        body: "Merci de renseigner ton RPE et/ou ton analyse de séance pour l'entraînement passé.",
        reference_id: referenceId,
        url: `/trainings/${ev.id}`,
        scheduled_for: now,
      });
    }
  }

  if (allRows.length === 0) return 0;

  const { error } = await supabase.from("notifications").insert(allRows);
  if (error) {
    console.error("[session-reminders] insert error:", error);
    return 0;
  }

  return allRows.length;
}
