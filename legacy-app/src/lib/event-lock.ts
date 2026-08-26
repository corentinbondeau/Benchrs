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
 * Détermine si un évènement est verrouillé.
 *
 * Si `endDate` est fournie et valide, elle fait foi comme référence de fin
 * réelle de l'évènement : verrouillé quand `now > endDate`.
 * Sinon (absente, null ou invalide), repli sur la règle historique :
 * `event_date + 3h < now()`.
 * Retourne `false` si `eventDate` est absente ou invalide.
 */
export function isEventLocked(
  eventDate: string | Date | null | undefined,
  endDate?: string | Date | null,
  now: number = Date.now()
): boolean {
  if (!eventDate) return false;

  const date = eventDate instanceof Date ? eventDate : new Date(eventDate);
  const time = date.getTime();

  if (Number.isNaN(time)) return false;

  if (endDate) {
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    const endTime = end.getTime();
    if (!Number.isNaN(endTime)) {
      return endTime < now;
    }
  }

  return time + EVENT_LOCK_GRACE_MS < now;
}

/**
 * Calcule la durée d'un évènement en minutes entre `eventDate` et `endDate`.
 * Retourne `null` si `endDate` est absente, invalide, ou antérieure/égale à
 * `eventDate` (incohérent).
 */
export function getEventDurationMinutes(
  eventDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined
): number | null {
  if (!eventDate || !endDate) return null;

  const start = eventDate instanceof Date ? eventDate : new Date(eventDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate);

  const startTime = start.getTime();
  const endTime = end.getTime();

  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;
  if (endTime <= startTime) return null;

  return Math.round((endTime - startTime) / (60 * 1000));
}

/**
 * Recalcule la fin d'un évènement quand son début change, en conservant la
 * durée d'origine (previousEnd - previousStart).
 *
 * Retourne `null` si `previousEnd` est absent (aucune fin n'existait avant,
 * on ne doit pas en fabriquer une) ou si une des dates est invalide/absente.
 */
export function shiftEndDate(
  previousStart: string | Date | null | undefined,
  previousEnd: string | Date | null | undefined,
  newStart: string | Date | null | undefined
): string | null {
  if (!previousStart || !previousEnd || !newStart) return null;

  const prevStart = previousStart instanceof Date ? previousStart : new Date(previousStart);
  const prevEnd = previousEnd instanceof Date ? previousEnd : new Date(previousEnd);
  const newStartDate = newStart instanceof Date ? newStart : new Date(newStart);

  const prevStartTime = prevStart.getTime();
  const prevEndTime = prevEnd.getTime();
  const newStartTime = newStartDate.getTime();

  if (
    Number.isNaN(prevStartTime) ||
    Number.isNaN(prevEndTime) ||
    Number.isNaN(newStartTime)
  ) {
    return null;
  }

  const durationMs = prevEndTime - prevStartTime;
  return new Date(newStartTime + durationMs).toISOString();
}

/**
 * Applique une durée (en minutes) à un début donné pour obtenir une fin.
 *
 * Retourne `null` si la durée est absente, nulle, négative, ou si le début
 * est invalide/absent.
 */
export function applyDurationToStart(
  start: string | Date | null | undefined,
  durationMinutes: number | null | undefined
): string | null {
  if (!start) return null;
  if (durationMinutes === null || durationMinutes === undefined) return null;
  if (durationMinutes <= 0) return null;

  const startDate = start instanceof Date ? start : new Date(start);
  const startTime = startDate.getTime();

  if (Number.isNaN(startTime)) return null;

  return new Date(startTime + durationMinutes * 60 * 1000).toISOString();
}
