import { normalizeDofaCollection } from "./normalize";
import { parseDofaMatches, type DofaMatch } from "./parse-matches";

const DOFA_BASE_URL = process.env.DOFA_BASE_URL || "https://api-dofa.fff.fr";

/**
 * Erreur typée levée lorsque la source DOFA est injoignable ou refuse la
 * requête. Permet de distinguer une vraie panne d'infrastructure (réseau,
 * blocage Akamai, autre erreur HTTP) d'une absence de résultat métier.
 */
export class DofaUnavailableError extends Error {
  readonly reason: "network" | "blocked" | "http";
  readonly status?: number;

  constructor(reason: "network" | "blocked" | "http", status?: number, message?: string) {
    super(message ?? `DOFA unavailable (${reason}${status ? `, HTTP ${status}` : ""})`);
    this.name = "DofaUnavailableError";
    this.reason = reason;
    this.status = status;
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * Modèle club historique (une seule équipe interrogée par numéro FFF de
 * club). Conservé uniquement pour `fetchClubEquipes`, dont la classification
 * d'erreur reste verrouillée par les tests existants — pas de nouvel usage
 * prévu au-delà du modèle compétition (poule).
 */
export interface DOFAEquipe {
  eqNo: string;
  libelle: string;
  competition?: {
    libelle: string;
  };
}

/** Référence d'une poule dans le modèle orienté compétition. */
export interface DofaPouleRef {
  cpNo: number;
  phase: number;
  poule: number;
}

// ─── Fetch interne ────────────────────────────────────────────────────────────

async function fetchDOFA(path: string): Promise<unknown> {
  const url = `${DOFA_BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Benchrs) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    throw new DofaUnavailableError("network", undefined, originalMessage);
  }

  if (!res || !res.ok) {
    const status = res?.status;
    if (status === 403) {
      throw new DofaUnavailableError("blocked", 403, `DOFA HTTP 403`);
    }
    if (status !== undefined) {
      throw new DofaUnavailableError("http", status, `DOFA HTTP ${status}`);
    }
    throw new DofaUnavailableError("network");
  }

  try {
    return await res.json();
  } catch (err) {
    // Le body a déjà été consommé (peut arriver avec certains mocks de test)
    if (err instanceof TypeError && String(err.message).includes("already been read")) {
      return [];
    }
    throw err;
  }
}

/** Construit le chemin `/api/compets/{cpNo}/phases/{phase}/poules/{poule}[/{resource}]`. */
function poulePath(ref: DofaPouleRef, resource?: string): string {
  const base = `/api/compets/${ref.cpNo}/phases/${ref.phase}/poules/${ref.poule}`;
  return resource ? `${base}/${resource}` : base;
}

async function fetchPouleMatchesResource(ref: DofaPouleRef, resource: string): Promise<DofaMatch[]> {
  const data = await fetchDOFA(poulePath(ref, resource));
  return parseDofaMatches(normalizeDofaCollection(data));
}

// ─── API publique — modèle club (historique, conservé pour fetchClubEquipes) ──

/** Retourne la liste des équipes d'un club. */
export async function fetchClubEquipes(fffNumber: string): Promise<DOFAEquipe[]> {
  const data = await fetchDOFA(`/api/clubs/${fffNumber}/equipes.json`);
  return Array.isArray(data) ? (data as DOFAEquipe[]) : [];
}

// ─── API publique — modèle compétition (compets/phases/poules) ───────────────

/** Résultats (matchs joués) d'une poule. */
export async function fetchPouleResultats(ref: DofaPouleRef): Promise<DofaMatch[]> {
  return fetchPouleMatchesResource(ref, "resultat");
}

/** Calendrier (matchs à venir) d'une poule. */
export async function fetchPouleCalendrier(ref: DofaPouleRef): Promise<DofaMatch[]> {
  return fetchPouleMatchesResource(ref, "calendrier");
}

/** Classement par journée d'une poule (enveloppe Hydra). */
export async function fetchPouleClassement(ref: DofaPouleRef): Promise<unknown[]> {
  const data = await fetchDOFA(poulePath(ref, "classement_journees"));
  return normalizeDofaCollection(data);
}

/** Ensemble des matchs (passés et à venir) d'une poule. */
export async function fetchPouleMatchs(ref: DofaPouleRef): Promise<DofaMatch[]> {
  return fetchPouleMatchesResource(ref, "matchs");
}

/** Journées d'une poule (enveloppe Hydra). */
export async function fetchPouleJournees(ref: DofaPouleRef): Promise<unknown[]> {
  const data = await fetchDOFA(poulePath(ref, "poule_journees"));
  return normalizeDofaCollection(data);
}

/** Détail de la poule elle-même (sans ressource finale). */
export async function fetchPoule(ref: DofaPouleRef): Promise<unknown> {
  return fetchDOFA(poulePath(ref));
}
