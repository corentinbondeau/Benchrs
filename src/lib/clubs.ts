// Identité des clubs : normalisation du numéro d'affiliation FFF et des noms de club.

const FFF_NUMBER_RE = /^[0-9]{6}$/;

/** Normalise un numéro d'affiliation FFF : garde les chiffres, exige 6 exactement. */
export function normalizeFffNumber(input: string): string | null {
  const digits = input.replace(/[^0-9]/g, "");
  return FFF_NUMBER_RE.test(digits) ? digits : null;
}

// Mots structurels ignorés dans les noms de club (club, article, "football club" ...).
const CLUB_STOPWORDS = new Set([
  "club", "sporting", "sports", "sport", "sportive", "sportif",
  "olympique", "football", "foot", "futbol", "association", "union",
  "stade", "stadiste", "jeunesse", "amicale", "amical", "societe",
  "fc", "ac", "us", "as", "sc", "es", "rc", "co", "cs", "ss", "ec", "ol", "om",
  "et", "de", "du", "des", "la", "le", "les", "l",
]);

/**
 * Slug de nom de club : minuscules, sans accents ni ponctuation, sans les mots
 * structurels ("Etoile Club de Camphin" -> "etoilecamphin"). Utilisé pour la
 * recherche/autocomplétion, PAS pour l'identité canonique (le numéro FFF prime).
 */
export function normalizeClubName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`-]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !CLUB_STOPWORDS.has(w))
    .join("");
}
