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