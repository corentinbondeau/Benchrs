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
 * Détermine le décalage UTC (en minutes) appliqué par le fuseau
 * `Europe/Paris` à un instant donné, changement d'heure compris (UTC+2 en
 * été, UTC+1 en hiver). Calculé sans dépendance externe via
 * `Intl.DateTimeFormat` : on formate l'instant naïf (interprété comme si
 * les champs de date/heure locaux valaient l'UTC) dans le fuseau cible, la
 * différence entre le résultat et l'entrée donne le décalage réel — la
 * même technique que la conversion classique "round-trip" utilisée pour
 * émuler `Date.parse` avec fuseau explicite sans librairie.
 */
function parisOffsetMinutes(
  year: number,
  month: number, // 1-12
  day: number,
  hours: number,
  minutes: number
): number {
  // Instant de référence : les champs demandés interprétés en UTC.
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = dtf.formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  // Instant représentant, en UTC, la même écriture de champs telle que lue
  // dans le fuseau Europe/Paris pour l'instant `asUtc`.
  const parisReading = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );

  // Le décalage réel Europe/Paris à cet instant = différence entre la
  // lecture locale et l'instant UTC de référence.
  return (parisReading - asUtc) / 60000;
}

/**
 * Compose la date brute DOFA (`"2026-09-06T00:00:00+00:00"`, qui ne porte
 * pas l'heure réelle du match) avec l'heure au format `"HHhMM"` — heure
 * LOCALE Europe/Paris — pour produire l'INSTANT UTC réel du coup d'envoi,
 * rendu en ISO 8601 UTC (ex. `"2026-09-06T13:00:00.000Z"` pour un match à
 * 15H00 heure française en septembre).
 *
 * BUG CORRIGÉ (dates de match décalées de 2h) : l'ancienne implémentation
 * renvoyait un horodatage NAÏF sans fuseau (`"2026-09-06T15:00"`) que
 * PostgreSQL, en colonne `TIMESTAMPTZ`, interprétait à tort comme un
 * instant UTC — un match à 15H00 heure française s'affichait donc à 17h00.
 * La conversion ci-dessous détermine le décalage réel Europe/Paris à la
 * date du match via `Intl.DateTimeFormat` (UTC+2 l'été / UTC+1 l'hiver,
 * changement d'heure compris), sans dépendance externe.
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

  const [year, month, day] = dateOnly.split("-").map(Number);
  const { hours, minutes } = parsedTime;

  // `dateOnly` peut être une chaîne non parsable (validée en amont par
  // `ingest-validation.ts`, mais `composeKickoff` ne doit jamais throw) :
  // repli sur la date seule plutôt qu'une exception.
  if ([year, month, day].some((n) => Number.isNaN(n))) return dateOnly;

  // Décalage Europe/Paris déterminé sur l'instant naïf (date + heure locale
  // interprétée comme UTC) : suffisant pour choisir le bon côté du
  // changement d'heure, la bascule ayant lieu à une heure fixe locale.
  const offsetMinutes = parisOffsetMinutes(year, month, day, hours, minutes);

  const localAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const realInstant = localAsUtc - offsetMinutes * 60000;

  return new Date(realInstant).toISOString();
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
