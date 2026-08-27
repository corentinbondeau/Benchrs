/**
 * Types du contrat réel de l'API compétition DOFA (`api-dofa.fff.fr`,
 * modèle orienté compétition : `/compets/{cp_no}/phases/{phase}/poules/{poule}/…`).
 *
 * Ces types décrivent la forme brute renvoyée par l'API, telle qu'observée
 * sur la fixture réelle `resultat-d4-pouleD.json` (District des Flandres).
 * Ils sont volontairement permissifs (champs optionnels) car l'API peut
 * omettre des clés selon l'endpoint.
 */

export interface DofaTeamRef {
  club: { cl_no: number; logo?: string };
  category_code?: string;
  number: number;
  code?: number;
  short_name: string;
  type?: string;
  category_label?: string;
  category_gender?: string;
}

export interface DofaTerrain {
  te_no?: number;
  name?: string | null;
  zip_code?: string | null;
  city?: string | null;
  libelle_surface?: string;
  address?: string | null;
}

export interface DofaRawMatch {
  ma_no: number;
  competition?: {
    cp_no: number;
    season?: number;
    type?: string;
    name?: string;
    level?: string;
    cdg?: { cg_no: number; name: string };
  };
  phase?: { number: number; type?: string; name?: string };
  poule?: {
    stage_number: number;
    name?: string;
    poule_unique?: boolean;
    at_least_one_match_resultat?: boolean;
  };
  poule_journee?: { number: number; name?: string };
  home?: DofaTeamRef;
  away?: DofaTeamRef;
  terrain?: DofaTerrain | null;
  season?: number;
  status?: string | null;
  date: string;
  time?: string | null;
  home_score?: number | null;
  home_is_forfeit?: string;
  away_score?: number | null;
  away_is_forfeit?: string;
  seems_postponed?: string;
}

/** Triplet identifiant une poule dans le modèle orienté compétition. */
export interface DofaPouleRef {
  cp_no: number;
  phase: number;
  poule: number;
}

/** Identité d'une équipe : club.cl_no + number (jamais short_name seul). */
export interface TeamIdentity {
  clNo: number;
  number: number;
}
