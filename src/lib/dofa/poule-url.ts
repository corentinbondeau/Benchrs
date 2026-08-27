/**
 * parsePouleUrl() — extrait le triplet { cpNo, phase, poule } depuis une URL
 * de poule du site district FFF (ex. flandres.fff.fr, escaut.fff.fr, …) ou
 * depuis une saisie manuelle du triplet sous la forme "cpNo/phase/poule".
 *
 * 🔒 Fonction exposée à une saisie utilisateur non fiable : la validation du
 * domaine repose exclusivement sur `new URL(...).hostname` (jamais une
 * recherche de sous-chaîne), pour ne pas être contournable par un userinfo
 * trompeur (`host@evil.com`), un sous-domaine mimétique
 * (`fff.fr.evil.com`), un domaine ressemblant (`notfff.fr`, `xfff.fr`) ou une
 * query string piégée. Ne lève jamais d'exception : toute entrée invalide,
 * y compris `null`/`undefined`, renvoie `null`.
 */

const FFF_ROOT_DOMAIN = "fff.fr";

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

export function parsePouleUrl(
  input: string
): { cpNo: number; phase: number; poule: number } | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Cas 1 : saisie manuelle du triplet "cpNo/phase/poule".
  const manualMatch = /^(\d+)\/(\d+)\/(\d+)$/.exec(trimmed);
  if (manualMatch) {
    return parseTriplet(manualMatch[1], manualMatch[2], manualMatch[3]);
  }

  // Cas 2 : URL du site district.
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (!isFffHostname(url.hostname)) return null;

  const params = url.searchParams;
  return parseTriplet(params.get("id"), params.get("phase"), params.get("poule"));
}
