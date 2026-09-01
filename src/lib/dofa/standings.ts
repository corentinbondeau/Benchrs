import { normalizeDofaCollection } from "./normalize";
import type { DofaMatch } from "./parse-matches";

/** Ligne de classement — clé d'agrégation cl_no + number (jamais short_name seul). */
export interface StandingRow {
  clNo: number;
  number: number;
  shortName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

/**
 * Barème forfait retenu (proposition par défaut du TODO, point A2 à
 * confirmer par le métier) :
 *   - Défaite 0 pt pour l'équipe forfait ;
 *   - Score forfaitaire 0-3 imposé pour le calcul de la différence de buts ;
 *   - PAS de retrait de point supplémentaire ;
 *   - Double forfait : défaite des deux équipes (0 pt chacune), score 0-0
 *     comptabilisé (aucune bonification de buts pour personne).
 * À réviser si le §4 A2 du TODO est tranché différemment par le métier.
 */
const FORFEIT_SCORE = 3;

function teamKey(clNo: number, number: number): string {
  return `${clNo}/${number}`;
}

function ensureRow(
  rows: Map<string, StandingRow>,
  clNo: number,
  number: number,
  shortName: string
): StandingRow {
  const key = teamKey(clNo, number);
  let row = rows.get(key);
  if (!row) {
    row = {
      clNo,
      number,
      shortName,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    };
    rows.set(key, row);
  }
  return row;
}

/**
 * Calcule le classement (3 pts victoire / 1 pt nul / 0 pt défaite) à partir
 * des matchs parsés. Les matchs non joués (score `null`) sont IGNORÉS du
 * calcul — ils ne comptent jamais comme un nul 0-0 (le `DEFAULT 0` du
 * schéma DB a historiquement causé cette confusion, cf. TODO risque #2).
 *
 * Toutes les équipes engagées apparaissent, même sans aucun match joué
 * (cas réel : saison qui débute), pour ne jamais renvoyer un tableau vide.
 */
export function computeStandings(matches: DofaMatch[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  // Ordre d'entrée mémorisé pour un départage stable, non-flaky.
  const insertionOrder: string[] = [];

  const registerTeam = (
    clNo: number,
    number: number,
    shortName: string
  ): void => {
    const key = teamKey(clNo, number);
    if (!rows.has(key)) {
      insertionOrder.push(key);
    }
    ensureRow(rows, clNo, number, shortName);
  };

  for (const match of matches) {
    registerTeam(match.homeTeam.clNo, match.homeTeam.number, match.homeTeam.shortName);
    registerTeam(match.awayTeam.clNo, match.awayTeam.number, match.awayTeam.shortName);

    const home = ensureRow(rows, match.homeTeam.clNo, match.homeTeam.number, match.homeTeam.shortName);
    const away = ensureRow(rows, match.awayTeam.clNo, match.awayTeam.number, match.awayTeam.shortName);

    const isForfeit = match.homeIsForfeit || match.awayIsForfeit;

    let homeScore = match.homeScore;
    let awayScore = match.awayScore;

    if (isForfeit) {
      // Barème forfait documenté ci-dessus : score forfaitaire imposé pour
      // le calcul, sauf double forfait (0-0, aucune bonification de buts).
      if (match.homeIsForfeit && match.awayIsForfeit) {
        homeScore = 0;
        awayScore = 0;
      } else if (match.homeIsForfeit) {
        homeScore = 0;
        awayScore = FORFEIT_SCORE;
      } else {
        homeScore = FORFEIT_SCORE;
        awayScore = 0;
      }
    }

    // Match non joué (score null, pas de forfait) → ignoré du calcul.
    if (homeScore === null || awayScore === null) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (isForfeit) {
      // Le forfait est toujours une défaite pour l'équipe forfait, y
      // compris en cas de double forfait (défaite des deux).
      if (match.homeIsForfeit) {
        home.lost += 1;
        home.points += 0;
      } else {
        home.won += 1;
        home.points += 3;
      }
      if (match.awayIsForfeit) {
        away.lost += 1;
        away.points += 0;
      } else {
        away.won += 1;
        away.points += 3;
      }
    } else if (homeScore > awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (homeScore < awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  for (const row of rows.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  // Tri : points DESC, puis différence de buts, puis buts marqués ;
  // départage stable par ordre d'entrée (index dans insertionOrder) pour
  // éviter tout test flaky.
  const orderIndex = new Map(insertionOrder.map((key, index) => [key, index]));

  return Array.from(rows.entries())
    .sort(([keyA, a], [keyB, b]) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return (orderIndex.get(keyA) ?? 0) - (orderIndex.get(keyB) ?? 0);
    })
    .map(([, row]) => row);
}

/**
 * Parse l'enveloppe Hydra du classement officiel FFF
 * (`classement_journees`) en `StandingRow[]`. Fonction pure, ne lève
 * jamais d'exception.
 */
export function parseOfficialStandings(data: unknown): StandingRow[] {
  const items = normalizeDofaCollection(data);
  const rows: StandingRow[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const club = raw.club as Record<string, unknown> | undefined;
    const clNo = club?.cl_no;
    const number = club?.number;

    if (typeof clNo !== "number" || typeof number !== "number") continue;

    rows.push({
      clNo,
      number,
      shortName: typeof raw.short_name === "string" ? raw.short_name : "",
      played: typeof raw.played === "number" ? raw.played : 0,
      won: typeof raw.won === "number" ? raw.won : 0,
      drawn: typeof raw.drawn === "number" ? raw.drawn : 0,
      lost: typeof raw.lost === "number" ? raw.lost : 0,
      goalsFor: typeof raw.goals_for === "number" ? raw.goals_for : 0,
      goalsAgainst: typeof raw.goals_against === "number" ? raw.goals_against : 0,
      goalDifference:
        (typeof raw.goals_for === "number" ? raw.goals_for : 0) -
        (typeof raw.goals_against === "number" ? raw.goals_against : 0),
      points: typeof raw.points === "number" ? raw.points : 0,
    });
  }

  return rows;
}

/**
 * Détecte si la liste de matchs fournie ne couvre qu'une partie des
 * confrontations attendues dans la poule (round-robin simple).
 *
 * Algorithme :
 *   1. Si `expectedTeamCount < 2` ou `matches` est vide → couverture partielle
 *      (pas assez de données pour un classement fiable).
 *   2. Collecte les paires d'équipes distinctes (identifiées par `clNo + number`)
 *      sous forme canonique (petite clé d'abord) pour dédupliquer.
 *   3. Compare le nombre de paires observées au nombre théorique d'un
 *      round-robin complet : n*(n-1)/2.
 *   4. Si observées < théoriques → `true` (partiel), sinon `false` (complet).
 *
 * Fonction pure — pas d'I/O, pas de side effects.
 */
export function isPartialCoverage(
  matches: DofaMatch[],
  expectedTeamCount: number
): boolean {
  if (expectedTeamCount < 2 || matches.length === 0) return true;

  const pairs = new Set<string>();

  for (const match of matches) {
    const homeKey = teamKey(match.homeTeam.clNo, match.homeTeam.number);
    const awayKey = teamKey(match.awayTeam.clNo, match.awayTeam.number);
    // Clé canonique non ordonnée : on trie lexicographiquement pour dédupliquer
    // (A vs B) === (B vs A).
    const pairKey =
      homeKey < awayKey ? `${homeKey}|${awayKey}` : `${awayKey}|${homeKey}`;
    pairs.add(pairKey);
  }

  const expectedPairs =
    (expectedTeamCount * (expectedTeamCount - 1)) / 2;

  return pairs.size < expectedPairs;
}

/**
 * Résout la source de classement à exposer au coach : privilégie le
 * classement officiel FFF s'il est non vide, sinon bascule sur le
 * classement calculé localement. La source retenue est exposée pour
 * permettre à l'UI d'afficher un badge (« officiel » vs « calculé »).
 */
export function resolveStandings(
  official: unknown,
  matches: DofaMatch[]
): { rows: StandingRow[]; source: "official" | "computed" } {
  const officialRows = parseOfficialStandings(official);

  if (officialRows.length > 0) {
    return { rows: officialRows, source: "official" };
  }

  return { rows: computeStandings(matches), source: "computed" };
}
