/**
 * Calcule un taux d'assiduité (0-100) à partir d'attendances, restreint à une
 * liste d'ids d'événements (typiquement des entraînements).
 *
 * Règle métier : l'assiduité ne doit compter QUE la présence aux
 * entraînements (events.type = 'training'), jamais les matchs.
 * "présent" = status === "present" || status === "late".
 *
 * @returns null si aucune attendance ne correspond aux ids fournis (ex:
 *   aucun entraînement sur la période).
 */
export function computeAttendanceRate(
  attendances: { event_id: string; status: string }[],
  eventIds: string[]
): number | null {
  const set = new Set(eventIds);
  const filtered = attendances.filter((a) => set.has(a.event_id));
  if (filtered.length === 0) return null;
  const present = filtered.filter((a) => a.status === "present" || a.status === "late").length;
  return Math.round((present / filtered.length) * 100);
}
