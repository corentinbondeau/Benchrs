/**
 * persist-mapping.ts — LOT 6 (persistance du triplet DOFA + matchs importés)
 *
 * Fonctions PURES de mapping `DofaMatch[]` → lignes prêtes à upserter.
 * Aucune I/O, aucun appel Supabase, aucun SQL ici : c'est à l'appelant
 * (couche service) d'exécuter l'upsert avec les clés d'idempotence
 * documentées ci-dessous, alignées sur les index uniques de la migration
 * `082_championship_dofa.sql`.
 */

import type { DofaMatch } from "./parse-matches";

/** Entrée de `buildChampionshipUpsert` — identité du championnat suivi. */
export interface BuildChampionshipUpsertInput {
  teamId: string;
  cpNo: number;
  phase: number;
  poule: number;
  /** Identité du club suivi (club.cl_no) — jamais short_name seul. */
  clNo: number;
  teamNumber: number;
}

/**
 * Ligne à upserter sur `championships`.
 * Clé d'idempotence : `team_id` + `dofa_cp_no` + `dofa_phase` + `dofa_poule`
 * (index unique partiel, cf. migration 082 — limité aux lignes où
 * `dofa_cp_no IS NOT NULL` pour ne pas entrer en collision avec les
 * championnats saisis manuellement).
 */
export interface ChampionshipUpsert {
  team_id: string;
  dofa_cp_no: number;
  dofa_phase: number;
  dofa_poule: number;
  dofa_cl_no: number;
  dofa_team_number: number;
  last_imported_at: string;
}

/**
 * Ligne à upserter sur `championship_standings`.
 * Clé d'idempotence : `championship_id` + `dofa_ma_no` (index unique,
 * cf. migration 082 — limité aux lignes où `dofa_ma_no IS NOT NULL`).
 *
 * ⚠️ `home_score`/`away_score` sont `null` pour un match non joué, jamais
 * `0` — c'est le garde-fou central du lot (cf. tests).
 */
export interface MatchUpsert {
  championship_id: string;
  dofa_ma_no: number;
  matchday_number: number | null;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  kickoff: string | null;
  location: string | null;
  location_address: string | null;
  location_city: string | null;
  postponed: boolean;
  home_is_forfeit: boolean;
  away_is_forfeit: boolean;
  source: "dofa_import";
}

/**
 * Construit la ligne d'upsert du championnat suivi (triplet cp_no/phase/
 * poule + identité de l'équipe suivie). Fonction pure : `last_imported_at`
 * est déduit de l'horloge système au moment de l'appel, sans aucun autre
 * effet de bord.
 */
export function buildChampionshipUpsert(
  input: BuildChampionshipUpsertInput
): ChampionshipUpsert {
  return {
    team_id: input.teamId,
    dofa_cp_no: input.cpNo,
    dofa_phase: input.phase,
    dofa_poule: input.poule,
    dofa_cl_no: input.clNo,
    dofa_team_number: input.teamNumber,
    last_imported_at: new Date().toISOString(),
  };
}

/**
 * Construit les lignes d'upsert des matchs d'un championnat, à partir des
 * `DofaMatch[]` déjà parsés (cf. `parse-matches.ts`).
 *
 * ⚠️ Contrat de non-effacement (test-sentinelle) : cette fonction ne
 * retourne QUE des lignes à upserter — jamais une instruction de
 * suppression, jamais de flag `deleteAll`/`_replace`. Un tableau d'entrée
 * vide produit un tableau vide en sortie, ce qui est un pur no-op côté
 * DB : l'appelant NE DOIT JAMAIS faire précéder l'upsert d'un DELETE basé
 * sur ce retour vide, sous peine d'effacer des matchs existants (saisis
 * manuellement ou importés lors d'une exécution précédente) qui ne
 * figurent simplement pas dans le lot DOFA courant (ex. page paginée,
 * flux réseau partiel).
 *
 * Aucun identifiant aléatoire n'est généré : la clé d'idempotence
 * (`championship_id` + `dofa_ma_no`) est entièrement déterministe, ce qui
 * garantit qu'un ré-import de la même fixture produit des lignes
 * structurellement identiques (upsert, jamais de doublon).
 */
export function buildMatchUpserts(
  matches: DofaMatch[],
  championshipId: string
): MatchUpsert[] {
  return matches.map((match) => ({
    championship_id: championshipId,
    dofa_ma_no: match.maNo,
    matchday_number: match.matchday,
    home_team: match.homeTeam.shortName,
    away_team: match.awayTeam.shortName,
    home_score: match.homeScore,
    away_score: match.awayScore,
    kickoff: match.kickoff,
    location: match.location?.name ?? null,
    location_address: match.location?.address ?? null,
    location_city: match.location?.city ?? null,
    postponed: match.seemsPostponed,
    home_is_forfeit: match.homeIsForfeit,
    away_is_forfeit: match.awayIsForfeit,
    source: "dofa_import",
  }));
}
