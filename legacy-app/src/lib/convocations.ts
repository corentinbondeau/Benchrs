import { createAdminClient } from "@/lib/supabase/admin";

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
