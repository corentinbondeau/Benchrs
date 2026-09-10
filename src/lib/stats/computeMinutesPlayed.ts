export interface Substitution {
  minute: number;
  playerOut: string;
  playerIn: string;
}

/**
 * Calcule le temps de jeu (en minutes de match) par joueur.
 *
 * Se base sur le CHRONO du match en direct et non sur le temps réel :
 *  - match terminé → durée complète du chrono (2 × durée de mi-temps)
 *  - 2e mi-temps en cours → 1ère mi-temps clôturée à `halfDuration` + temps de la 2e
 *  - mi-temps → 1ère clôturée à `halfDuration`
 *  - 1re mi-temps en cours → temps écoulé plafonné à `halfDuration`
 */
export function computeMinutesPlayed(
  startedAt: string | null,
  endedAt: string | null,
  substitutions: Substitution[],
  starterIds: string[],
  now?: number,
  halftimeAt?: string | null,
  resumedAt?: string | null,
  halfDuration = 45
): Map<string, number> {
  if (!startedAt) return new Map();

  const HALF = halfDuration;
  const FULL = halfDuration * 2;
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : (now ?? Date.now());
  const ht = halftimeAt ? new Date(halftimeAt).getTime() : null;
  const rs = resumedAt ? new Date(resumedAt).getTime() : null;

  let totalMinutes: number;
  if (endedAt) {
    // Match terminé → durée complète du chrono (ex : 90')
    totalMinutes = FULL;
  } else if (ht && rs) {
    // 2e mi-temps en cours → 1ère clôturée + temps de jeu de la 2e
    totalMinutes =
      HALF + Math.round(Math.max(0, end - rs) / 60000);
    totalMinutes = Math.min(totalMinutes, FULL);
  } else if (ht) {
    // Mi-temps → 1ère mi-temps clôturée
    totalMinutes = HALF;
  } else {
    // 1re mi-temps en cours → temps écoulé plafonné à la mi-temps
    totalMinutes = Math.min(Math.round(Math.max(0, end - start) / 60000), HALF);
  }

  totalMinutes = Math.max(0, Math.min(totalMinutes, FULL));

  const minutes = new Map<string, number>();

  // Tous les titulaires jouent la durée complète par défaut
  for (const id of starterIds) {
    minutes.set(id, totalMinutes);
  }

  // Appliquer les substitutions
  for (const sub of substitutions) {
    // Le sortant n'a joué que jusqu'à la minute de la substitution
    minutes.set(sub.playerOut, Math.min(sub.minute, totalMinutes));
    // L'entrant joue de la minute de sub jusqu'à la fin
    minutes.set(sub.playerIn, Math.max(totalMinutes - sub.minute, 0));
  }

  return minutes;
}