// Règle métier partagée : un évènement est "verrouillé" (planification et convocations
// figées) 3 heures après sa date de début. Le score, le statut, les données live et les
// contenus post-match (rapports, notes, RPE, MOTM, checklists) restent modifiables.
//
// Constante unique côté TS (miroir SQL : interval '3 hours' dans
// supabase/migrations/075_lock_past_events.sql).
export const EVENT_LOCK_GRACE_MS = 3 * 60 * 60 * 1000;

export const EVENT_LOCKED_MESSAGE =
  "Cet évènement est passé : il ne peut plus être modifié.";

export const CONVOCATION_LOCKED_MESSAGE =
  "Cet évènement est passé : les convocations sont closes.";

/**
 * Détermine si un évènement est verrouillé : `event_date + 3h < now()`.
 * Retourne `false` si la date est absente ou invalide.
 */
export function isEventLocked(
  eventDate: string | Date | null | undefined,
  now: number = Date.now()
): boolean {
  if (!eventDate) return false;

  const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
  const time = date.getTime();

  if (Number.isNaN(time)) return false;

  return time + EVENT_LOCK_GRACE_MS < now;
}
