import type { PouleTeam } from "../dofa/poule-teams";

/**
 * round-robin.ts — génération du calendrier complet d'une poule type
 * championnat (double round-robin : chaque équipe rencontre chaque autre
 * équipe une fois à domicile, une fois à l'extérieur).
 *
 * L'import DOFA ne ramène que les matchs de l'équipe suivie (le coach colle
 * le JSON de la page « Ouvrir mes matchs »). Ce module permet de compléter
 * la poule avec les confrontations des AUTRES équipes, à partir de la
 * liste des équipes déjà connues (`collectPoolTeams`), afin que le coach
 * puisse saisi tous les scores et tenir le classement à jour.
 *
 * Algorithme « méthode du cercle » : une équipe fixée, les autres tournent.
 * Pour un nombre impair d'équipes, une équipe est exempte (bye) chaque
 * journée — aucune confrontation fantôme n'est jamais émise.
 *
 * Fonctions PURES : aucune I/O, aucune mutation d'entrée.
 */

export interface PoolFixture {
  home: PouleTeam;
  away: PouleTeam;
  /** Journée 1-based (aller = 1..n-1, retour = n..2(n-1)). */
  matchday: number;
}

export function teamKey(clNo: number, number: number): string {
  return `${clNo}/${number}`;
}

interface Pairing {
  homeIdx: number;
  awayIdx: number;
  round: number;
}

/** Fait tourner la liste des slots en gardant le slot 0 fixe. */
function rotateLastToFront(slots: number[]): number[] {
  return [slots[0], slots[slots.length - 1], ...slots.slice(1, slots.length - 1)];
}

/** Aller simple : chaque équipe rencontre chaque autre exactement une fois. */
function buildAller(teamCount: number): Pairing[] {
  const even = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  const rounds = even - 1;
  const half = even / 2;
  let slots: number[] = Array.from({ length: even }, (_, i) => (i < teamCount ? i : -1));

  const out: Pairing[] = [];
  for (let r = 0; r < rounds; r++) {
    for (let s = 0; s < half; s++) {
      const i = slots[s];
      const j = slots[even - 1 - s];
      if (i < 0 || j < 0) continue;
      out.push({ homeIdx: i, awayIdx: j, round: r + 1 });
    }
    slots = rotateLastToFront(slots);
  }
  return out;
}

/**
 * Calendrier complet (aller + retour) d'une poule de `teams`.
 *
 * Garanties (verrouillées par les tests) :
 *   - chaque paire d'équipes apparaît exactement DEUX fois, une fois dans
 *     chaque sens (aller/retour) ;
 *   - jamais de match d'une équipe contre elle-même ;
 *   - le retour est l'exact inverse home/away de l'aller ;
 *   - une équipe joue au plus une fois par journée (bye pour une équipe si
 *     le nombre d'équipes est impair).
 */
export function generatePoolFixtures(teams: PouleTeam[]): PoolFixture[] {
  if (teams.length < 2) return [];

  const aller = buildAller(teams.length);
  const maxRound = aller.length > 0 ? aller[aller.length - 1].round : 0;

  const fixtures: PoolFixture[] = aller.map((p) => ({
    home: teams[p.homeIdx],
    away: teams[p.awayIdx],
    matchday: p.round,
  }));

  for (const p of aller) {
    fixtures.push({
      home: teams[p.awayIdx],
      away: teams[p.homeIdx],
      matchday: p.round + maxRound,
    });
  }

  return fixtures;
}