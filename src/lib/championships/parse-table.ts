/**
 * Parseur de tableau de résultats de matchs.
 *
 * Accepte des données collées depuis Excel, Google Sheets, des sites web ou
 * des PDF. Robuste face aux données sales (espaces superflus, accents, casse
 * variable, lignes d'en-tête, lignes vides).
 *
 * Aucune dépendance React — testable unitairement.
 */

export interface ParsedMatchRow {
  /** Numéro de journée, si détecté. */
  matchday?: number;
  /** Date brute, si détectée (non normalisée). */
  date?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  /** Ligne originale, pour debug/affichage. */
  raw: string;
}

export interface ParseResult {
  matches: ParsedMatchRow[];
  errors: { line: number; raw: string; reason: string }[];
  /** Format majoritairement détecté dans l'entrée. */
  format: "tab" | "csv" | "dash" | "unknown";
}

// ── Constantes ────────────────────────────────────────────────────────────

/** Mots d'en-tête à ignorer (insensible à la casse, sans accents). */
const HEADER_KEYWORDS = [
  "equipe", "équipe", "domicile", "dom", "exterieur", "extérieur", "ext",
  "score", "resultat", "résultat", "journee", "journée", "date", "heure",
  "match", "poule", "groupe", "j.", "home", "away", "visitor", "vs",
  "pts", "points", "classement",
];

/** Pattern : date française dd/mm/yyyy ou dd-mm-yyyy. */
const DATE_RE = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;

/** Pattern : numéro de journée seul (J5, J.5, 5e, etc.) ou entier 1-99. */
const MATCHDAY_RE = /^[Jj]\.?\s*(\d{1,2})|^(\d{1,2})[eè]?\s*$/;

// ── Utilitaires ───────────────────────────────────────────────────────────

/** Normalise un nom d'équipe : trim + collapse whitespace. */
function normalizeTeam(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Retire les accents pour les comparaisons insensibles. */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Détermine si un token ressemble à un mot d'en-tête. */
function isHeaderToken(token: string): boolean {
  const norm = deaccent(token.trim().toLowerCase());
  return HEADER_KEYWORDS.some((kw) => norm.includes(deaccent(kw)));
}

/** Tente d'extraire (homeScore, awayScore) depuis un token "2-1" ou "2 - 1". */
function parseScoreToken(token: string): [number, number] | null {
  const m = token.trim().match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

/** Tente de parser un token comme entier >= 0. */
function parseIntToken(token: string): number | null {
  const v = parseInt(token.trim(), 10);
  if (Number.isNaN(v) || v < 0 || String(v) !== token.trim()) return null;
  return v;
}

/** Tente d'extraire un numéro de journée d'un token. */
function parseMatchday(token: string): number | null {
  const m = token.trim().match(MATCHDAY_RE);
  if (!m) return null;
  const n = parseInt(m[1] ?? m[2], 10);
  return Number.isNaN(n) ? null : n;
}

/** Tente d'extraire une date française d'un token. */
function isDateToken(token: string): boolean {
  return DATE_RE.test(token.trim());
}

// ── Détection du format ───────────────────────────────────────────────────

function detectFormat(lines: string[]): "tab" | "csv" | "dash" | "unknown" {
  let tabs = 0, semicolons = 0, commas = 0, dashes = 0;
  for (const line of lines.slice(0, 20)) {
    if (line.includes("\t")) tabs++;
    else if (line.includes(";")) semicolons++;
    else if (line.includes(",")) commas++;
    // dash : présence d'un score "X-Y" ou "X - Y" hors contexte tab/csv
    else if (/\d\s*[-–]\s*\d/.test(line)) dashes++;
  }
  if (tabs >= semicolons && tabs >= commas && tabs >= dashes) return "tab";
  if (semicolons >= commas && semicolons >= dashes) return "csv";
  if (commas >= dashes) return "csv";
  if (dashes > 0) return "dash";
  return "unknown";
}

// ── Parseurs par format ───────────────────────────────────────────────────

/**
 * Tente de parser une ligne en utilisant plusieurs patterns.
 * Retourne un ParsedMatchRow partiel ou null si aucun pattern ne correspond.
 */
function parseLine(raw: string, format: "tab" | "csv" | "dash" | "unknown"): Omit<ParsedMatchRow, "raw"> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Choisir le séparateur principal
  const sep =
    format === "tab" ? "\t" :
    format === "csv" ? (trimmed.includes(";") ? ";" : ",") :
    null;

  if (sep) {
    const parts = trimmed.split(sep).map((p) => p.trim());
    return parseTabOrCsvParts(parts);
  }

  // Format "dash" ou "unknown" : score inline "X-Y"
  return parseDashLine(trimmed);
}

/**
 * Parse un tableau de tokens (tab-séparés ou CSV).
 *
 * Patterns reconnus (par ordre de priorité) :
 *   [matchday,] [date,] home, hscore, ascore, away
 *   [matchday,] [date,] home, "score", away          (score fusionné "2-1")
 *   home, hscore, ascore, away
 *   home, "score", away
 */
function parseTabOrCsvParts(parts: string[]): Omit<ParsedMatchRow, "raw"> | null {
  if (parts.length < 3) return null;

  let idx = 0;
  let matchday: number | undefined;
  let date: string | undefined;

  // Token optionnel : journée (J5, 5, 5e…)
  const md = parseMatchday(parts[idx]);
  if (md !== null && parts.length >= 4) {
    matchday = md;
    idx++;
  }

  // Token optionnel : date
  if (idx < parts.length && isDateToken(parts[idx]) && parts.length >= idx + 3) {
    date = parts[idx].trim();
    idx++;
  }

  const remaining = parts.slice(idx);

  // Pattern A : home, hscore, ascore, away (au moins 4 tokens restants)
  if (remaining.length >= 4) {
    const hScore = parseIntToken(remaining[1]);
    const aScore = parseIntToken(remaining[2]);
    if (hScore !== null && aScore !== null) {
      const home = normalizeTeam(remaining[0]);
      const away = normalizeTeam(remaining[3]);
      if (home && away) {
        return { matchday, date, homeTeam: home, awayTeam: away, homeScore: hScore, awayScore: aScore };
      }
    }
    // Pattern A' : away, ascore, hscore, home (score inversé)
    const hScore2 = parseIntToken(remaining[remaining.length - 3]);
    const aScore2 = parseIntToken(remaining[remaining.length - 2]);
    if (hScore2 !== null && aScore2 !== null) {
      const home = normalizeTeam(remaining[0]);
      const away = normalizeTeam(remaining[remaining.length - 1]);
      if (home && away && home !== away) {
        return { matchday, date, homeTeam: home, awayTeam: away, homeScore: hScore2, awayScore: aScore2 };
      }
    }
  }

  // Pattern B : home, "2-1", away (score fusionné)
  if (remaining.length >= 3) {
    // Score au milieu
    const midIdx = Math.floor(remaining.length / 2);
    for (let si = 1; si < remaining.length - 1; si++) {
      const score = parseScoreToken(remaining[si]);
      if (score) {
        const home = normalizeTeam(remaining.slice(0, si).join(" "));
        const away = normalizeTeam(remaining.slice(si + 1).join(" "));
        if (home && away) {
          return { matchday, date, homeTeam: home, awayTeam: away, homeScore: score[0], awayScore: score[1] };
        }
      }
    }
    void midIdx; // silence lint
  }

  // Pattern C : 3 tokens — home, score fusionné, away
  if (remaining.length === 3) {
    const score = parseScoreToken(remaining[1]);
    if (score) {
      const home = normalizeTeam(remaining[0]);
      const away = normalizeTeam(remaining[2]);
      if (home && away) {
        return { matchday, date, homeTeam: home, awayTeam: away, homeScore: score[0], awayScore: score[1] };
      }
    }
  }

  // Pattern D : home, away (match sans score)
  if (remaining.length === 2) {
    const home = normalizeTeam(remaining[0]);
    const away = normalizeTeam(remaining[1]);
    if (home && away && !isHeaderToken(home) && !isHeaderToken(away)) {
      return { matchday, date, homeTeam: home, awayTeam: away, homeScore: null, awayScore: null };
    }
  }

  return null;
}

/**
 * Parse une ligne au format "Équipe Dom 2-1 Équipe Ext"
 * ou "Équipe Dom 2 - 1 Équipe Ext".
 */
function parseDashLine(line: string): Omit<ParsedMatchRow, "raw"> | null {
  // Pattern avec score inline "X - Y" ou "X-Y"
  // On cherche le score le plus proche du centre
  const scoreRe = /(\d{1,3})\s*[-–]\s*(\d{1,3})/g;
  let bestMatch: RegExpExecArray | null = null;
  let match;

  while ((match = scoreRe.exec(line)) !== null) {
    bestMatch = match;
  }

  if (!bestMatch) return null;

  const scoreStart = bestMatch.index;
  const scoreEnd = bestMatch.index + bestMatch[0].length;
  const home = normalizeTeam(line.slice(0, scoreStart));
  const away = normalizeTeam(line.slice(scoreEnd));

  if (!home || !away) return null;

  return {
    homeTeam: home,
    awayTeam: away,
    homeScore: parseInt(bestMatch[1], 10),
    awayScore: parseInt(bestMatch[2], 10),
  };
}

// ── Détection d'en-tête ───────────────────────────────────────────────────

/**
 * Retourne true si la ligne ressemble à un en-tête de tableau.
 * Logique : au moins 2 tokens sont des mots-clés d'en-tête connus, OU
 * tous les tokens sont des mots-clés.
 */
function isHeaderLine(line: string): boolean {
  const tokens = line.split(/[\t;,]/).map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return false;
  const headerCount = tokens.filter(isHeaderToken).length;
  // Heuristique : si la moitié+ des tokens sont des mots d'en-tête
  return headerCount >= Math.max(2, Math.ceil(tokens.length / 2));
}

// ── Point d'entrée ────────────────────────────────────────────────────────

/**
 * Parse un texte collé (résultats de matchs) et retourne les matchs détectés.
 *
 * @param input Texte brut collé par le coach (Excel, site web, PDF…)
 */
export function parseMatchTable(input: string): ParseResult {
  const rawLines = input.split(/\r?\n/);
  const format = detectFormat(rawLines.filter((l) => l.trim()));

  const matches: ParsedMatchRow[] = [];
  const errors: ParseResult["errors"] = [];

  rawLines.forEach((raw, zeroIdx) => {
    const lineNum = zeroIdx + 1;
    const trimmed = raw.trim();

    // Ignorer lignes vides
    if (!trimmed) return;

    // Ignorer les lignes d'en-tête
    if (isHeaderLine(trimmed)) return;

    const parsed = parseLine(raw, format);

    if (!parsed) {
      errors.push({ line: lineNum, raw: trimmed, reason: "Format non reconnu" });
      return;
    }

    // Sanity check : deux équipes différentes
    if (parsed.homeTeam.toLowerCase() === parsed.awayTeam.toLowerCase()) {
      errors.push({ line: lineNum, raw: trimmed, reason: "Équipe domicile et extérieure identiques" });
      return;
    }

    matches.push({ ...parsed, raw: trimmed });
  });

  return { matches, errors, format };
}
