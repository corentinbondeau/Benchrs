import { normalizeDofaCollection } from "./normalize";

/** Équipe identifiée par club.cl_no + number (jamais short_name seul). */
export interface DofaMatchTeam {
  clNo: number;
  number: number;
  shortName: string;
}

/** Lieu de rencontre, ou `null` si aucun terrain n'est renseigné. */
export interface DofaLocation {
  name: string | null;
  address: string | null;
  zipCode: string | null;
  city: string | null;
}

/** Match DOFA parsé — forme exploitée par le reste de l'application. */
export interface DofaMatch {
  maNo: number;
  matchday: number | null;
  /** Horodatage local composé (date + heure), ou date seule si l'heure est absente/invalide. */
  kickoff: string | null;
  /** Date brute ISO conservée telle quelle (ex. "2026-09-06T00:00:00+00:00"). */
  date: string;
  homeTeam: DofaMatchTeam;
  awayTeam: DofaMatchTeam;
  homeScore: number | null;
  awayScore: number | null;
  homeIsForfeit: boolean;
  awayIsForfeit: boolean;
  location: DofaLocation | null;
  seemsPostponed: boolean;
  status: string | null;
}

/**
 * Convertit l'heure au format FFF `"HHhMM"` (séparateur `H`, pas `:`, ex.
 * "15H00", "9H30") en `{ hours, minutes }`. Ne lève jamais d'exception :
 * toute entrée absente, vide ou malformée (bornes hors [0-23]/[0-59],
 * format inattendu) renvoie `null` plutôt qu'une heure fantôme.
 */
export function parseTime(
  time: string | null | undefined
): { hours: number; minutes: number } | null {
  if (!time) return null;

  const match = /^(\d{1,2})H(\d{1,2})$/.exec(time.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return { hours, minutes };
}

/**
 * Compose la date brute DOFA (`"2026-09-06T00:00:00+00:00"`, qui ne porte
 * pas l'heure réelle du match) avec l'heure au format `"HHhMM"` pour
 * produire un horodatage local exploitable (`"2026-09-06T15:00"`).
 *
 * Si l'heure est absente ou malformée, on replie sur la date seule plutôt
 * que d'écarter le match (ne jamais reproduire l'échec silencieux de la
 * cause n°4 : un match sans heure valide reste un match).
 */
export function composeKickoff(
  date: string,
  time: string | null | undefined
): string | null {
  if (!date || typeof date !== "string") return null;

  const dateOnly = date.slice(0, 10);
  const parsedTime = parseTime(time);

  if (!parsedTime) return dateOnly;

  const hh = String(parsedTime.hours).padStart(2, "0");
  const mm = String(parsedTime.minutes).padStart(2, "0");
  return `${dateOnly}T${hh}:${mm}`;
}

function parseTeamRef(
  ref: unknown
): DofaMatchTeam | null {
  if (!ref || typeof ref !== "object") return null;
  const r = ref as Record<string, unknown>;
  const club = r.club as Record<string, unknown> | undefined;
  const clNo = club?.cl_no;
  const number = r.number;
  const shortName = r.short_name;

  if (typeof clNo !== "number" || typeof number !== "number") return null;

  return {
    clNo,
    number,
    shortName: typeof shortName === "string" ? shortName : "",
  };
}

function parseLocation(terrain: unknown): DofaLocation | null {
  if (!terrain || typeof terrain !== "object") return null;
  const t = terrain as Record<string, unknown>;
  return {
    name: typeof t.name === "string" ? t.name : null,
    address: typeof t.address === "string" ? t.address : null,
    zipCode: typeof t.zip_code === "string" ? t.zip_code : null,
    city: typeof t.city === "string" ? t.city : null,
  };
}

/**
 * Parse une collection brute DOFA (résultat, calendrier, matchs — toute
 * source acceptée par `normalizeDofaCollection`) en `DofaMatch[]`.
 *
 * Garde-fous (anti-régression cause n°4 — parser historique qui attendait
 * des champs inexistants et renvoyait silencieusement une liste vide) :
 *   - un élément sans `ma_no` exploitable est ignoré (pas de match fantôme) ;
 *   - un élément dont `home`/`away` sont absents ou mal formés est ignoré ;
 *   - un tableau dont tous les éléments portent un `ma_no` valide ne doit
 *     JAMAIS produire 0 match (verrouillé côté tests, cf. sentinelle).
 */
export function parseDofaMatches(data: unknown): DofaMatch[] {
  const items = normalizeDofaCollection(data);
  const matches: DofaMatch[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;

    const maNo = raw.ma_no;
    if (typeof maNo !== "number") continue;

    const homeTeam = parseTeamRef(raw.home);
    const awayTeam = parseTeamRef(raw.away);
    if (!homeTeam || !awayTeam) continue;

    const date = typeof raw.date === "string" ? raw.date : "";
    const time = raw.time as string | null | undefined;

    const homeScore = raw.home_score;
    const awayScore = raw.away_score;

    const poule_journee = raw.poule_journee as
      | Record<string, unknown>
      | undefined;
    const matchdayNumber = poule_journee?.number;

    matches.push({
      maNo,
      matchday: typeof matchdayNumber === "number" ? matchdayNumber : null,
      kickoff: composeKickoff(date, time),
      date,
      homeTeam,
      awayTeam,
      homeScore: typeof homeScore === "number" ? homeScore : null,
      awayScore: typeof awayScore === "number" ? awayScore : null,
      homeIsForfeit: raw.home_is_forfeit === "O",
      awayIsForfeit: raw.away_is_forfeit === "O",
      location: parseLocation(raw.terrain),
      seemsPostponed: raw.seems_postponed === "O",
      status: typeof raw.status === "string" ? raw.status : null,
    });
  }

  return matches;
}
