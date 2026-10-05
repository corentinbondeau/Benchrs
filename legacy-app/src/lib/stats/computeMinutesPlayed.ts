export interface Substitution {
  minute: number;
  playerOut: string;
  playerIn: string;
}

export interface RedCard {
  playerId: string;
  /** Minute de l'expulsion. `null` si l'événement a été saisi sans minute : le
   *  joueur est alors compté jusqu'à la fin du chrono (information tardive). */
  minute: number | null;
}

/**
 * Calcule le temps de jeu (en minutes de match) par joueur.
 *
 * Se base sur le CHRONO du match en direct et non sur le temps réel :
 *  - match terminé → durée complète du chrono (2 × durée de mi-temps)
 *  - 2e mi-temps en cours → 1ère mi-temps clôturée à `halfDuration` + temps de la 2e
 *  - mi-temps → 1ère clôturée à `halfDuration`
 *  - 1re mi-temps en cours → temps écoulé plafonné à `halfDuration`
 *
 * Temps de jeu = somme des segments passés sur le terrain :
 *  - les titulaires (`starterIds`) démarrent à la minute 0
 *  - une substitution clôt le segment du sortant à `sub.minute` et ouvre celui
 *    de l'entrant à `sub.minute`
 *  - un carton rouge (`redCards`) clôt le segment de l'expulsé à sa minute et le
 *   DEFINITIVEMENT : il ne peut plus être réintégré par une substitution
 *    ultérieure (règle football, exclusion du joueur)
 *  - tout joueur encore sur le terrain à la fin est clôturé à `totalMinutes`
 *  - un remplaçant jamais entré n'apparaît PAS dans la Map (=> 0 minute)
 */
export function computeMinutesPlayed(
  startedAt: string | null,
  endedAt: string | null,
  substitutions: Substitution[],
  starterIds: string[],
  now?: number,
  halftimeAt?: string | null,
  resumedAt?: string | null,
  halfDuration = 45,
  redCards: RedCard[] = []
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

  const clamp = (m: number) => Math.max(0, Math.min(m, totalMinutes));

  // Joueur → minute de début de son segment actuel (0 pour les titulaires)
  const onPitch = new Map<string, number>();
  for (const id of starterIds) {
    if (!onPitch.has(id)) onPitch.set(id, 0);
  }

  const played = new Map<string, number>();

  // Expulsés : un joueur rouge ne peut plus être réintégré par une substitution
  // ultérieure. `openSegment` refuse donc de le remettre sur le terrain.
  const sentOff = new Set<string>();

  const closeSegment = (id: string, atMinute: number) => {
    const segStart = onPitch.get(id);
    if (segStart === undefined) return;
    const m = clamp(atMinute);
    played.set(id, (played.get(id) ?? 0) + Math.max(0, m - segStart));
    onPitch.delete(id);
  };

  const openSegment = (id: string, atMinute: number) => {
    // Ne pas rouvrir un segment pour un joueur déjà sur le terrain…
    if (onPitch.has(id)) return;
    // …ni pour un joueur expulsé : l'exclusion est définitive.
    if (sentOff.has(id)) return;
    onPitch.set(id, clamp(atMinute));
  };

  // Timeline chronologique unique : sorties (substitutions) ET expulsions (rouges).
  // Sans cela, une substitution saisie APRÈS le rouge rouvrirait le segment du
  // joueur et son temps de jeu repartirait de zéro.
  const subs = [...substitutions].sort((a, b) => a.minute - b.minute);
  const reds = [...redCards].sort((a, b) => (a.minute ?? totalMinutes) - (b.minute ?? totalMinutes));

  let i = 0;
  let j = 0;
  while (i < subs.length || j < reds.length) {
    const nextSub = subs[i];
    const nextRed = reds[j];
    const redMinute = nextRed ? (nextRed.minute ?? totalMinutes) : null;
    // À minute égale, le carton rouge est traité en premier (règle : le joueur
    // expulsé ne peut pas être remplacé dans la foulée).
    const takeSub = nextSub !== undefined && (redMinute === null || nextSub.minute <= redMinute);
    if (takeSub && nextSub) {
      closeSegment(nextSub.playerOut, nextSub.minute);
      openSegment(nextSub.playerIn, nextSub.minute);
      i++;
    } else if (nextRed) {
      sentOff.add(nextRed.playerId);
      closeSegment(nextRed.playerId, redMinute ?? totalMinutes);
      j++;
    } else {
      break;
    }
  }

  // Clôture des segments restants à la fin du match
  for (const [id, segStart] of onPitch) {
    played.set(id, (played.get(id) ?? 0) + Math.max(0, totalMinutes - segStart));
  }

  return played;
}