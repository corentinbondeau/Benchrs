/**
 * pagination.ts — aide à l'import page par page des collections DOFA
 *
 * La ressource `matchs` d'une poule complète est PAGINÉE par le site
 * (30 matchs par page, `itemsPerPage` ignoré/capé). Un unique collage ne
 * ramène donc qu'une page (~5 journées sur 22), raison pour laquelle le
 * championnat semblait s'arrêter au bout de 5 journées. L'API DOFA est
 * conforme Hydra/Api Platform : chaque page renvoie `hydra:totalItems` et
 * `hydra:view` (avec `hydra:next`/`next`). Ce module extrait ces méta-
 * données pour guider l'utilisateur collage après collage jusqu'à la
 * dernière page.
 */

/** Origine des URLs RELATIVES renvoyées par hydra:view (chemin `/api/...`). */
const DOFA_API_ORIGIN = "https://api-dofa.fff.fr";

export interface DofaPagination {
  /** Nombre total de matchs déclaré par l'API (`hydra:totalItems`), null si absent. */
  totalItems: number | null;
  /** Nombre de matchs contenus dans la page collée. */
  pageSize: number;
  /** Numéro de la page collée (déduit de `hydra:view.@id`), null si indéterminé. */
  currentPage: number | null;
  /** Dernière page (déduit de `hydra:last`/`last`), null si indéterminé. */
  lastPage: number | null;
  /** URL absolue de la page suivante, null si la page collée est la dernière. */
  nextUrl: string | null;
}

function toAbsolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${DOFA_API_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
}

function pageNumberFromUrl(url: string): number | null {
  try {
    const n = Number(new URL(url, DOFA_API_ORIGIN).searchParams.get("page"));
    return Number.isInteger(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

/** Fonction pure, jamais d'exception : toute méta-donnée absente → null. */
export function extractDofaPagination(data: unknown): DofaPagination {
  if (!data || typeof data !== "object") {
    return { totalItems: null, pageSize: 0, currentPage: null, lastPage: null, nextUrl: null };
  }

  const root = data as Record<string, unknown>;
  const member = root["hydra:member"];
  const pageSize = Array.isArray(member) ? member.length : 0;

  const totalItems =
    typeof root["hydra:totalItems"] === "number" && (root["hydra:totalItems"] as number) > 0
      ? (root["hydra:totalItems"] as number)
      : null;

  const view = root["hydra:view"];
  if (!view || typeof view !== "object") {
    return { totalItems, pageSize, currentPage: null, lastPage: null, nextUrl: null };
  }

  const v = view as Record<string, unknown>;

  const nextCandidate =
    typeof v["hydra:next"] === "string" ? v["hydra:next"] : typeof v.next === "string" ? v.next : null;
  const lastCandidate =
    typeof v["hydra:last"] === "string" ? v["hydra:last"] : typeof v.last === "string" ? v.last : null;
  const currentCandidate = typeof v["@id"] === "string" ? v["@id"] : null;

  return {
    totalItems,
    pageSize,
    currentPage: currentCandidate ? pageNumberFromUrl(currentCandidate) : null,
    lastPage: lastCandidate ? pageNumberFromUrl(lastCandidate) : null,
    nextUrl: nextCandidate ? toAbsolute(nextCandidate) : null,
  };
}

/** Erreur levée quand le téléchargement des pages restantes échoue (HTTP ou réseau/CORS). */
export class DofaFetchError extends Error {}

/** Extraits les matchs (tableau nu ou enveloppe Hydra) d'une réponse du site. */
function extractMatchItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray((data as Record<string, unknown>)["hydra:member"])) {
    return (data as Record<string, unknown>)["hydra:member"] as unknown[];
  }
  return [];
}

export interface FetchAllDofaOptions {
  /** Injection de fetch (tests) — par défaut `window.fetch` (navigateur utilisateur). */
  fetcher?: (url: string) => Promise<Response>;
  /** Plafond du nombre total de matchs (aligné sur MAX_INGEST_MATCHES=500). */
  maxMatches?: number;
  /** Garde anti-boucle : nombre maximal de pages téléchargées. */
  maxPages?: number;
  onProgress?: (page: number, pageSize: number, total: number | null) => void;
}

export interface FetchAllDofaResult {
  matches: unknown[];
  pages: number;
  total: number | null;
}

/**
 * Déroule TOUTES les pages d'une collection paginée à partir de la première
 * page collée par l'utilisateur, en suivant les liens `hydra:view.next`
 * retournés par le site. L'IMGÉTORIAL se fait DANS LE NAVIGATEUR de
 * l'utilisateur : le site DOFA est inaccessible depuis un serveur Benchrs
 * (403 Akamai sur les IP de datacenter), mais ouvert depuis un navigateur —
 * c'est ce même mécanisme qui rend le collage manuel possible.
 *
 * Combine ensuite tous les matchs en UNE collection pour un seul POST
 * d'ingestion (contourne le garde-fou des 60 s : une seule écriture).
 *
 * Fonction PURE côté décision : ne produit aucune écriture. Lève
 * `DofaFetchError` si une page suivante est introuvable/impossible à
 * charger (HTTP, JSON illisible, CORS) — l'appelant retombe alors sur le
 * collage manuel guidé.
 */
export async function fetchAllDofaMatchPages(
  firstPage: unknown,
  options: FetchAllDofaOptions = {}
): Promise<FetchAllDofaResult> {
  const fetcher = options.fetcher ?? ((url: string) => fetch(url));
  const maxMatches = options.maxMatches ?? 500;
  const maxPages = options.maxPages ?? 10;
  const onProgress = options.onProgress;

  const matches: unknown[] = [];
  let current = firstPage;
  let pages = 0;
  let total: number | null = null;

  while (pages < maxPages) {
    const items = extractMatchItems(current);
    matches.push(...items);
    const pagination = extractDofaPagination(current);
    if (total === null) total = pagination.totalItems;
    pages += 1;
    onProgress?.(pages, items.length, total);

    if (!pagination.nextUrl) break;
    if (matches.length >= maxMatches) break;

    const res = await fetcher(pagination.nextUrl);
    if (!res.ok) {
      throw new DofaFetchError(
        `Impossible de charger la page ${pages + 1} (HTTP ${res.status}). Collez les pages restantes manuellement : la page précédente est sauvegardée.`
      );
    }

    let nextData: unknown = null;
    try {
      nextData = await res.json();
    } catch {
      throw new DofaFetchError(
        "Le site a renvoyé une réponse illisible (JSON attendu). Collez les pages restantes manuellement."
      );
    }

    // Garde anti-boucle : une page identique à la précédente (pagination qui
    // ne progresse plus) = fin, sans erreur.
    if (JSON.stringify(extractDofaPagination(nextData)) === JSON.stringify(pagination)) break;
    current = nextData;
  }

  // Déduplication par `ma_no` (chevauchenents de pages éventuels).
  const seen = new Set<string>();
  const unique: unknown[] = [];
  for (const match of matches) {
    const raw = match as Record<string, unknown> | null;
    const key = raw && typeof raw.ma_no === "number" ? String(raw.ma_no) : null;
    if (key === null || !seen.has(key)) {
      if (key !== null) seen.add(key);
      unique.push(match);
    }
  }

  return { matches: unique.slice(0, maxMatches), pages, total };
}