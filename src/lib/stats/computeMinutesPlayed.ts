export interface Substitution {
  minute: number;
  playerOut: string;
  playerIn: string;
}

export function computeMinutesPlayed(
  startedAt: string | null,
  endedAt: string | null,
  substitutions: Substitution[],
  starterIds: string[],
  now?: number
): Map<string, number> {
  if (!startedAt) return new Map();

  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : (now ?? Date.now());
  const totalMinutes = Math.round((end - start) / 60000);

  const minutes = new Map<string, number>();

  // Tous les titulaires jouent la durée complète par défaut
  for (const id of starterIds) {
    minutes.set(id, totalMinutes);
  }

  // Appliquer les substitutions
  for (const sub of substitutions) {
    // Le sortant n'a joué que jusqu'à la minute de la substitution
    minutes.set(sub.playerOut, sub.minute);
    // L'entrant joue de la minute de sub jusqu'à la fin
    minutes.set(sub.playerIn, totalMinutes - sub.minute);
  }

  return minutes;
}
