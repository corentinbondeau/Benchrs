"use client";

/**
 * browser-client.ts — Client DOFA côté navigateur.
 *
 * L'API DOFA (api-dofa.prd-aws.fff.fr) est bloquée par Akamai pour toute
 * requête provenant d'un serveur (403). En revanche, les requêtes navigateur
 * passent. Ce module doit donc être exécuté EXCLUSIVEMENT côté client.
 *
 * Le token Bearer est récupéré publiquement depuis fff.fr et mis en cache
 * 45 minutes (durée typique observée en prod).
 */

const DOFA_BASE = "https://api-dofa.prd-aws.fff.fr";

// Cache du token Bearer (session navigateur uniquement)
let tokenCache: { token: string; exp: number } | null = null;

async function getDofaToken(): Promise<string | null> {
  if (tokenCache && tokenCache.exp > Date.now()) return tokenCache.token;
  try {
    const res = await fetch("https://www.fff.fr/api/dofa/token");
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return null;
    const data = await res.json().catch(() => ({}));
    const token =
      (typeof data?.token === "string" && data.token) ||
      (typeof data?.access_token === "string" && data.access_token) ||
      (typeof data?.jwt === "string" && data.jwt) ||
      (typeof data?.bearer === "string" && data.bearer) ||
      (data?.data && typeof data.data.token === "string" && data.data.token) ||
      null;
    if (token) {
      tokenCache = { token, exp: Date.now() + 45 * 60_000 };
      return token;
    }
  } catch {
    // Pas de token disponible, on continuera sans Authorization
  }
  return null;
}

async function dofaFetch(path: string): Promise<unknown> {
  const token = await getDofaToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${DOFA_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`DOFA ${res.status}`);
  return res.json();
}

/** Normalise les réponses Hydra ou tableau nu en tableau. */
function normalize(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const m = (data as Record<string, unknown>)["hydra:member"];
    if (Array.isArray(m)) return m;
  }
  return [];
}

/** Extrait le chemin relatif de la page suivante depuis hydra:view.next */
function getNextPage(data: unknown): string | null {
  if (data && typeof data === "object") {
    const view = (data as Record<string, unknown>)["hydra:view"];
    if (view && typeof view === "object") {
      const next = (view as Record<string, unknown>)["hydra:next"];
      if (typeof next === "string") return next;
    }
  }
  return null;
}

// ─── Interfaces publiques ──────────────────────────────────────────────────

export interface ClubEngagement {
  cpNo: number;
  competitionName: string;
  /** "ch" = championnat, "co" = coupe, autre = compétition spéciale */
  competitionType: string;
  phase: number;
  poule: number;
  pouleName?: string;
}

export interface ClubTeam {
  number: number;
  categoryCode: string;
  categoryLabel: string;
  season: number;
  engagements: ClubEngagement[];
}

// ─── API publique ──────────────────────────────────────────────────────────

/**
 * Liste les équipes et leurs engagements (championnats, coupes) d'un club FFF.
 *
 * Endpoint : GET /api/clubs/{clNo}/equipes.json?filter=
 */
export async function fetchClubTeams(clNo: number): Promise<ClubTeam[]> {
  const data = await dofaFetch(`/api/clubs/${clNo}/equipes.json?filter=`);
  const items = normalize(data);

  return items
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => {
      const rawEngagements = Array.isArray(item.engagements) ? item.engagements : [];
      const engagements: ClubEngagement[] = rawEngagements
        .filter((eng): eng is Record<string, unknown> => eng !== null && typeof eng === "object")
        .map((eng) => {
          const competition = eng.competition && typeof eng.competition === "object"
            ? (eng.competition as Record<string, unknown>)
            : {};
          const poule = eng.poule && typeof eng.poule === "object"
            ? (eng.poule as Record<string, unknown>)
            : {};
          const phase = eng.phase && typeof eng.phase === "object"
            ? (eng.phase as Record<string, unknown>)
            : {};

          return {
            cpNo: typeof competition.cp_no === "number" ? competition.cp_no : 0,
            competitionName: typeof competition.name === "string" ? competition.name : "Compétition",
            competitionType: typeof competition.type === "string" ? competition.type : "ch",
            phase: typeof phase.number === "number" ? phase.number : 1,
            poule: typeof poule.stage_number === "number" ? poule.stage_number : 1,
            pouleName: typeof poule.name === "string" ? poule.name : undefined,
          };
        })
        .filter((e) => e.cpNo > 0);

      return {
        number: typeof item.number === "number" ? item.number : 0,
        categoryCode: typeof item.category_code === "string" ? item.category_code : "",
        categoryLabel:
          typeof item.category_label === "string"
            ? item.category_label
            : typeof item.category_code === "string"
            ? item.category_code
            : "",
        season: typeof item.season === "number" ? item.season : 0,
        engagements,
      };
    });
}

/**
 * Charge TOUS les matchs d'une poule avec pagination automatique.
 *
 * Endpoint : GET /api/compets/{cpNo}/phases/{phase}/poules/{poule}/matchs.json?filter=
 * Pagination via hydra:view.next dans la réponse.
 *
 * @param onProgress Callback optionnel appelé à chaque page chargée (pageIndex, totalSoFar)
 */
export async function fetchAllPouleMatches(
  cpNo: number,
  phase: number,
  poule: number,
  onProgress?: (pageIndex: number, totalSoFar: number) => void
): Promise<unknown[]> {
  let allItems: unknown[] = [];
  let path: string | null =
    `/api/compets/${cpNo}/phases/${phase}/poules/${poule}/matchs.json?filter=`;
  let pageIndex = 0;

  while (path) {
    const data = await dofaFetch(path);
    const items = normalize(data);
    allItems = allItems.concat(items);
    pageIndex++;
    onProgress?.(pageIndex, allItems.length);
    path = getNextPage(data);
  }

  return allItems;
}

/**
 * Charge le classement officiel d'une poule.
 *
 * Endpoint : GET /api/compets/{cpNo}/phases/{phase}/poules/{poule}/classement_journees.json?filter=
 */
export async function fetchPouleStandings(
  cpNo: number,
  phase: number,
  poule: number
): Promise<unknown[]> {
  const data = await dofaFetch(
    `/api/compets/${cpNo}/phases/${phase}/poules/${poule}/classement_journees.json?filter=`
  );
  return normalize(data);
}
