/**
 * parsePouleUrl() — extrait le triplet { cpNo, phase, poule } depuis :
 *   1. une URL de poule du site district FFF (ex. flandres.fff.fr, escaut.fff.fr)
 *      → query string `?id=<cp_no>&phase=<n>&poule=<n>` ;
 *   2. une URL de la plateforme « Épreuves » (epreuves.fff.fr), seule source
 *      officielle des compétitions nationales et régionales :
 *      /competition/engagement/<cp_no>-<slug>/phase/<phase>/<poule>/saison
 *      (l'identifiant d'engagement EST le `cp_no`, et `phase/<a>/<b>` donne
 *      respectivement `phase.number` et `poule.stage_number`) ;
 *   3. une saisie manuelle du triplet sous la forme "cpNo/phase/poule".
 *
 * Sert à mémoriser le triplet du championnat (PATCH /api/championships) ;
 * le parcours d'import lui-même (collage du JSON DOFA) n'en dépend plus.
 *
 * 🔒 Fonction exposée à une saisie utilisateur non fiable : la validation du
 * domaine repose exclusivement sur `new URL(...).hostname` (jamais une
 * recherche de sous-chaîne), pour ne pas être contournable par un userinfo
 * trompeur (`host@evil.com`), un sous-domaine mimétique
 * (`fff.fr.evil.com`), un domaine ressemblant (`notfff.fr`, `xfff.fr`) ou une
 * query string piégée. Le contrôle du domaine précède toute lecture de chemin
 * ou de query. Ne lève jamais d'exception : toute entrée invalide, y compris
 * `null`/`undefined`, renvoie `null`.
 */

const FFF_ROOT_DOMAIN = "fff.fr";

export interface PouleRef {
  cpNo: number;
  phase: number;
  poule: number;
}

/** Vrai uniquement si `hostname` est `fff.fr` ou un sous-domaine réel de `fff.fr`. */
function isFffHostname(hostname: string): boolean {
  return hostname === FFF_ROOT_DOMAIN || hostname.endsWith(`.${FFF_ROOT_DOMAIN}`);
}

function parseTriplet(cpNoRaw: string | null, phaseRaw: string | null, pouleRaw: string | null) {
  if (!cpNoRaw || !phaseRaw || !pouleRaw) return null;

  if (!/^\d+$/.test(cpNoRaw) || !/^\d+$/.test(phaseRaw) || !/^\d+$/.test(pouleRaw)) {
    return null;
  }

  return {
    cpNo: Number(cpNoRaw),
    phase: Number(phaseRaw),
    poule: Number(pouleRaw),
  };
}

/**
 * Plateforme « Épreuves » (epreuves.fff.fr) :
 *   /competition/engagement/452059-u18-regional-2/phase/1/1/saison
 *                    ^^^^^^ cp_no  ^^^^^^^^^^^^^ slug (ignoré)
 *                                           ^ phase.number   ^ poule.stage_number
 * Le slug est facultatif, tout comme les segments trailing (`/saison`,
 * onglets, …) : seule la séquence `engagement/<n>…/phase/<n>/<n>` compte.
 */
const EPREUVES_PATH =
  /^\/competition\/engagement\/(\d+)(?:-[^/]*)?\/phase\/(\d+)\/(\d+)(?:\/[^/]*)*\/?$/;

export function parsePouleUrl(input: string): PouleRef | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Cas 1 : saisie manuelle du triplet "cpNo/phase/poule".
  const manualMatch = /^(\d+)\/(\d+)\/(\d+)$/.exec(trimmed);
  if (manualMatch) {
    return parseTriplet(manualMatch[1], manualMatch[2], manualMatch[3]);
  }

  // Cas 2 : URL FFF.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  // Domaine validé en premier : aucune donnée du chemin n'est lue avant.
  if (!isFffHostname(url.hostname)) return null;

  // Cas 3 : plateforme Épreuves (epreuves.fff.fr) — lecture du chemin.
  const epreuvesMatch = EPREUVES_PATH.exec(url.pathname);
  if (epreuvesMatch) {
    return parseTriplet(epreuvesMatch[1], epreuvesMatch[2], epreuvesMatch[3]);
  }

  // Cas 4 : site district — lecture de la query string.
  const params = url.searchParams;
  return parseTriplet(params.get("id"), params.get("phase"), params.get("poule"));
}
