import { createClient } from "@/lib/supabase/client";
import type { AttendanceStatus } from "@/types";

/**
 * Écriture de la réponse de présence (update si ligne existante, sinon insert).
 * Partagée par matches/[id] et trainings/[id] — la mise à jour optimiste de
 * l'état local, le toast et le log d'activité restent propres à chaque page.
 * Renvoie true si l'écriture a réussi.
 */
export async function saveAttendanceRow({
  eventId,
  userId,
  teamId,
  status,
  reason,
  attendanceId,
}: {
  eventId: string;
  userId: string;
  teamId: string;
  status: AttendanceStatus;
  reason?: string;
  attendanceId: string | null;
}): Promise<boolean> {
  const supabase = createClient();
  const now = new Date().toISOString();
  if (attendanceId) {
    const { error } = await supabase
      .from("attendances")
      .update({ status, responded_at: now, absence_reason: reason || null })
      .eq("id", attendanceId);
    return !error;
  }
  const { error } = await supabase.from("attendances").insert({
    event_id: eventId,
    user_id: userId,
    team_id: teamId,
    status,
    responded_at: now,
    absence_reason: reason || null,
  });
  return !error;
}