"use client";

/**
 * browser-client.ts — Client DOFA côté navigateur.
 *
 * L'API DOFA (api-dofa.fff.fr) bloque CORS + certaines IP datacenter (Akamai WAF).
 * Stratégie en cascade :
 *   1. Proxy Benchrs (/api/dofa-proxy) — Edge Runtime, headers Chrome
 *   2. Fallback direct via allorigins.win — proxy CORS public
 *
 * Le proxy Benchrs est authentifié (Bearer Supabase) et rate-limité.
 * Le fallback allorigins ne nécessite pas d'auth (données DOFA publiques).
 */

import { authFetch } from "@/lib/api-client";

const DOFA_BASE = "https://api-dofa.fff.fr";

async function dofaFetch(path: string): Promise<unknown> {
  // Stratégie 1 : proxy Benchrs (Edge Runtime)
  try {
    const proxyUrl = `/api/dofa-proxy?path=${encodeURIComponent(path)}`;
    const res = await authFetch(proxyUrl);
    if (res.ok) {
      return await res.json();
    }
    // 401 = problème d'auth Benchrs → on ne fallback pas
    if (res.status === 401) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || `Non autorisé (${res.status})`);
    }
    // 403 du proxy = soit whitelist Benchrs, soit Akamai → lire le message
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      const msg = body?.error || "";
      // Si c'est le whitelist Benchrs ("Chemin non autorisé"), pas de fallback
      if (msg.includes("non autorisé") || msg.includes("Chemin")) {
        throw new Error(msg);
      }
      // Sinon c'est Akamai → fallback
      console.warn(`[dofa] proxy 403 (Akamai), trying fallback...`);
    }
    // 502 = Akamai bloque le proxy → on tente le fallback
    console.warn(`[dofa] proxy returned ${res.status}, trying fallback...`);
  } catch (err) {
    // Si c'est une erreur d'auth, on la remonte
    if (err instanceof Error && (err.message.includes("Non autorisé") || err.message.includes("autorisé"))) {
      throw err;
    }
    console.warn("[dofa] proxy failed, trying fallback...", err);
  }

  // Stratégie 2 : fallback via proxys CORS publics (essayés en cascade)
  const directUrl = `${DOFA_BASE}${path}`;
  const corsProxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(directUrl)}`,
  ];

  for (const proxyUrl of corsProxies) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const text = await res.text();
        // Vérifier que c'est du JSON et pas une page HTML d'erreur
        if (text.startsWith("{") || text.startsWith("[")) {
          return JSON.parse(text);
        }
      }
    } catch {
      // Proxy indisponible, essayer le suivant
      continue;
    }
  }

  throw new Error(`L'API FFF est temporairement indisponible. Réessayez plus tard.`);
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

export interface ClubInfo {
  clNo: number;
  name: string;
  shortName: string;
}

/**
 * Résout un numéro de club : accepte le cl_no DOFA OU le numéro d'affiliation FFF.
 *
 * - Si < 100 000 → probablement un cl_no DOFA, on l'utilise directement
 * - Si >= 100 000 → probablement un numéro d'affiliation, on cherche via /api/clubs?cl_cod=
 *
 * Retourne le cl_no DOFA et le nom du club.
 */
export async function resolveClubNumber(input: number): Promise<ClubInfo> {
  // Les cl_no DOFA sont typiquement < 100 000, les numéros d'affiliation >= 100 000
  if (input >= 100_000) {
    // Recherche par numéro d'affiliation
    const data = await dofaFetch(`/api/clubs?cl_cod=${input}`);
    const items = normalize(data);
    if (items.length === 0) {
      throw new Error(`Aucun club trouvé avec le numéro d'affiliation ${input}`);
    }
    const club = items[0] as Record<string, unknown>;
    const clNo = typeof club.cl_no === "number" ? club.cl_no : 0;
    if (!clNo) throw new Error(`Club trouvé mais sans identifiant interne`);
    return {
      clNo,
      name: typeof club.name === "string" ? club.name : "Club",
      shortName: typeof club.short_name === "string" ? club.short_name : "Club",
    };
  }

  // cl_no DOFA direct — vérifier qu'il existe
  try {
    const data = await dofaFetch(`/api/clubs/${input}`);
    const club = data as Record<string, unknown>;
    return {
      clNo: input,
      name: typeof club.name === "string" ? club.name : "Club",
      shortName: typeof club.short_name === "string" ? club.short_name : "Club",
    };
  } catch {
    throw new Error(`Aucun club trouvé avec le numéro ${input}`);
  }
}

/**
 * Recherche un club par nom.
 * Endpoint : GET /api/clubs?filter={query}
 */
export async function searchClubByName(query: string): Promise<ClubInfo[]> {
  const data = await dofaFetch(`/api/clubs?filter=${encodeURIComponent(query)}`);
  const items = normalize(data);
  return items
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((club) => ({
      clNo: typeof club.cl_no === "number" ? club.cl_no : 0,
      name: typeof club.name === "string" ? club.name : "Club",
      shortName: typeof club.short_name === "string" ? club.short_name : "Club",
    }))
    .filter((c) => c.clNo > 0)
    .slice(0, 20);
}

/**
 * Liste les équipes et leurs engagements (championnats, coupes) d'un club FFF.
 *
 * Accepte un cl_no DOFA OU un numéro d'affiliation FFF (résolution automatique).
 */
export async function fetchClubTeams(clNo: number): Promise<{ clubInfo: ClubInfo; teams: ClubTeam[] }> {
  // Résoudre le numéro si c'est un numéro d'affiliation
  const clubInfo = await resolveClubNumber(clNo);
  const data = await dofaFetch(`/api/clubs/${clubInfo.clNo}/equipes`);
  const items = normalize(data);

  const teams: ClubTeam[] = items
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

  return { clubInfo, teams };
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
