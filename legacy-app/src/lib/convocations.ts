import { createAdminClient } from "@/lib/supabase/admin";
import { isEventLocked, CONVOCATION_LOCKED_MESSAGE } from "@/lib/event-lock";

// Crée les lignes de convocation (attendances) pour un événement UNIQUEMENT
// quand la notification de convocation est réellement envoyée.
// Les convocations ne doivent pas exister en base avant event_date - leadDays.
export async function ensureAttendanceRows(
  eventId: string,
  teamId: string,
  userIds: string[]
): Promise<void> {
  if (!userIds || userIds.length === 0) return;
  const supabase = createAdminClient();

  // Défense en profondeur : ce module utilise createAdminClient() (bypass RLS),
  // le trigger SQL bloque déjà l'écriture mais on évite l'appel réseau inutile
  // et on remonte un message métier clair.
  const { data: event } = await supabase
    .from("events")
    .select("event_date, end_date")
    .eq("id", eventId)
    .maybeSingle();

  if (
    isEventLocked(
      (event as { event_date: string; end_date: string | null } | null)?.event_date,
      (event as { event_date: string; end_date: string | null } | null)?.end_date
    )
  ) {
    throw new Error(CONVOCATION_LOCKED_MESSAGE);
  }

  const { data: existing } = await supabase
    .from("attendances")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("team_id", teamId);

  const existingIds = new Set((existing || []).map((r) => (r as { user_id: string }).user_id));
  const toInsert = userIds
    .filter((uid) => !existingIds.has(uid))
    .map((uid) => ({
      event_id: eventId,
      user_id: uid,
      status: "pending",
      team_id: teamId,
    }));

  if (toInsert.length > 0) {
    await supabase.from("attendances").insert(toInsert);
  }
}
