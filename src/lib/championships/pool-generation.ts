import { teamKey, type PoolFixture } from "./round-robin";
import type { PouleTeam } from "../dofa/poule-teams";

/**
 * pool-generation.ts — complétion automatique d'une poule type championnat.
 *
 * L'import DOFA ne ramène que les matchs de l'équipe suivie. À partir des
 * équipes déjà connues dans `championship_standings`, on génère le
 * calendrier aller/retour complet de la poule et on n'insère QUE les
 * confrontations manquantes (aucun doublon, aucun effacement).
 *
 * Fonctions PURES : les routes (ingest DOFA, bouton « Générer la poule »)
 * font l'I/O ; ce module décide et construit les lignes à insérer.
 */

/** Vue minimale d'une ligne `championship_standings` pour la déduplication. */
export interface ExistingPoolRow {
  home_cl_no: number | null;
  home_team_number: number | null;
  away_cl_no: number | null;
  away_team_number: number | null;
}

/** Vue d'une équipe connue de la poule. */
export interface KnownTeam {
  cl_no: number;
  number: number;
  short_name: string;
}

/** Clé ordonnée d'une confrontation (home|away) — sense-dépendante. */
export function orderedPairKey(
  home: Pick<PouleTeam, "clNo" | "number">,
  away: Pick<PouleTeam, "clNo" | "number">
): string {
  return `${teamKey(home.clNo, home.number)}|${teamKey(away.clNo, away.number)}`;
}

/** Ensemble des confrontations déjà présentes en base (sens exact). */
export function existingOrderedPairs(rows: ExistingPoolRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    if (
      typeof row.home_cl_no !== "number" ||
      typeof row.home_team_number !== "number" ||
      typeof row.away_cl_no !== "number" ||
      typeof row.away_team_number !== "number"
    ) {
      continue;
    }
    set.add(`${teamKey(row.home_cl_no, row.home_team_number)}|${teamKey(row.away_cl_no, row.away_team_number)}`);
  }
  return set;
}

/** Équipes distinctes de la poule, dédoublonnées sur cl_no + number. */
export function collectPoolTeams(teams: KnownTeam[]): PouleTeam[] {
  const byKey = new Map<string, PouleTeam>();
  for (const t of teams) {
    const key = teamKey(t.cl_no, t.number);
    if (!byKey.has(key)) {
      byKey.set(key, { clNo: t.cl_no, number: t.number, shortName: t.short_name });
    }
  }
  return Array.from(byKey.values());
}

/** Ligne `championship_standings` prête à insérer pour une confrontation générée. */
export interface PoolFixtureRow {
  championship_id: string;
  source: "manual";
  matchday_number: number;
  home_team: string;
  away_team: string;
  home_cl_no: number;
  home_team_number: number;
  away_cl_no: number;
  away_team_number: number;
  home_score: null;
  away_score: null;
  kickoff: null;
  location: null;
  postponed: false;
  home_is_forfeit: false;
  away_is_forfeit: false;
}

/**
 * Construit les lignes manquantes à insérer pour compléter la poule.
 * Les confrontations déjà présentes (sens exact) sont sautées : la
 * fonction est idempotente — un ré-appel après génération ne produit
 * aucune ligne.
 */
export function missingPoolFixtureRows(
  fixtures: PoolFixture[],
  existing: Set<string>,
  championshipId: string
): PoolFixtureRow[] {
  const rows: PoolFixtureRow[] = [];
  for (const fixture of fixtures) {
    if (existing.has(orderedPairKey(fixture.home, fixture.away))) continue;
    rows.push({
      championship_id: championshipId,
      source: "manual",
      matchday_number: fixture.matchday,
      home_team: fixture.home.shortName,
      away_team: fixture.away.shortName,
      home_cl_no: fixture.home.clNo,
      home_team_number: fixture.home.number,
      away_cl_no: fixture.away.clNo,
      away_team_number: fixture.away.number,
      home_score: null,
      away_score: null,
      kickoff: null,
      location: null,
      postponed: false,
      home_is_forfeit: false,
      away_is_forfeit: false,
    });
  }
  return rows;
}

/** Confort : nombre de matchs attendus pour `n` équipes (aller + retour). */
export function expectedFixtureCount(teamCount: number): number {
  return teamCount < 2 ? 0 : teamCount * (teamCount - 1);
}