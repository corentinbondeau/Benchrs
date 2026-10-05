import { createAdminClient } from "@/lib/supabase/admin";
import { isEventLocked, CONVOCATION_LOCKED_MESSAGE } from "@/lib/event-lock";
import { sundaySlotBefore } from "@/lib/paris-time";

/** Heure de Paris à laquelle partent les convocations de la semaine. */
export const CONVOCATION_SUNDAY_HOUR = 15;

export interface ConvocationSlotInput {
  /** Les matchs gardent leur logique `event_date - lead_days`. */
  type: "match" | "training";
  eventDate: string | Date;
  leadDays: number;
  /** Injecté en test pour rendre le calcul déterministe. */
  now?: Date;
}

/**
 * Instant auquel la notification de convocation doit être programmée.
 *
 * SÉANCES (`training`) : toujours le dimanche 15h précédant la séance, pour
 * que les familles reçoivent un seul envoi hebdomadaire lisible (« voici la
 * semaine ») plutôt qu'une notification par séance. Les joueurs restent ceux
 * que le coach a cochés : ce module ne choisit jamais les destinataires, il
 * calcule seulement QUAND les notifier.
 *
 * MATCHS : inchangé, `event_date - leadDays` (le délai reste paramétrable pour
 * un match car une convocation de match se décide au jour près).
 *
 * Si le créneau calculé est déjà passé (séance planifiée à la dernière minute,
 * ou lundi pour une séance du dimanche suivant dont le dimanche 15h est
 * derrière nous), on renvoie `now` : la convocation part alors au prochain
 * passage du cron plutôt que d'être perdue. La route `/api/notifications/send`
 * envoie immédiatement une notification dont `scheduled_for` est dépassé.
 */
export function convocationSlotFor({
  type,
  eventDate,
  leadDays,
  now = new Date(),
}: ConvocationSlotInput): Date {
  const event = typeof eventDate === "string" ? new Date(eventDate) : eventDate;
  if (Number.isNaN(event.getTime())) return now;

  const slot =
    type === "training"
      ? sundaySlotBefore(event, CONVOCATION_SUNDAY_HOUR)
      : new Date(event.getTime() - leadDays * 24 * 60 * 60 * 1000);

  return slot.getTime() <= now.getTime() ? now : slot;
}

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

  // Seuls les joueurs (role 'player') ont une ligne de convocation : les parents
  // reçoivent la notification mais n'apparaissent jamais dans les présences.
  const { data: playerRows } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("role", "player")
    .in("user_id", userIds);
  const playerIds = new Set((playerRows || []).map((r) => (r as { user_id: string }).user_id));

  const toInsert = userIds
    .filter((uid) => playerIds.has(uid) && !existingIds.has(uid))
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
