// Utilitaires de fuseau Europe/Paris.
//
// Raison d'être : le code a besoin de convertir des HEURES LOCALES parisiennes
// (FF « 15H00 », « dimanche 15h ») en INSTANTS UTC, et l'inverse. Un décalage
// naïf de 120 minutes est faux deux fois par an (Paris est en UTC+1 l'hiver) et
// tout décalage figé se trompe donc à chaque changement d'heure. On laisse Intl
// résoudre l'écart réel à l'instant concerné.

const PARIS_TIME_ZONE = "Europe/Paris";

export interface ParisParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = dimanche ... 6 = samedi. */
  weekday: number;
}

/** Lecture d'un instant en heures de Paris. */
export function parisParts(instant: Date): ParisParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: weekdays[get("weekday")] ?? new Date(instant).getUTCDay(),
  };
}

/**
 * Décalage réel Europe/Paris, en minutes, pour l'heure locale demandée.
 *
 * `Date.UTC` sert uniquement de point de comparaison : on interprète les champs
 * comme s'ils étaient en UTC, on relit cet instant à Paris, et l'écart entre
 * les deux lectures EST le décalage. C'est ce qui rend le calcul correct en
 * UTC+1 comme en UTC+2.
 */
export function parisOffsetMinutes(
  year: number,
  month: number, // 1-12
  day: number,
  hours: number,
  minutes: number
): number {
  const asUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const read = parisParts(new Date(asUtc));
  const parisReading = Date.UTC(
    read.year,
    read.month - 1,
    read.day,
    read.hour,
    read.minute,
    read.second
  );
  return (parisReading - asUtc) / 60000;
}

/**
 * Convertit une heure locale de Paris en instant UTC.
 *
 * L'ordre est important : `parisOffsetMinutes` raisonne sur les champs
 * demandés, il faut donc l'appeler AVANT de soustraire le décalage. Une seule
 * passe suffit — au moment du changement d'heure l'erreur résiduelle est bornée
 * à l'heure de transition, jamais de 24h.
 */
export function parisInstant(
  year: number,
  month: number, // 1-12
  day: number,
  hours: number,
  minutes: number
): Date {
  const naive = Date.UTC(year, month - 1, day, hours, minutes);
  const offset = parisOffsetMinutes(year, month, day, hours, minutes);
  return new Date(naive - offset * 60000);
}

/**
 * Dernier dimanche tombant STRICTEMENT avant `instant`, à `hour` heure de Paris.
 *
 * « Strictement avant » parce qu'une séance jouée un dimanche à 10h ne peut pas
 * être convoquée le dimanche à 15h de la même journée : la convocation part
 * donc du dimanche précédent.
 */
export function sundaySlotBefore(instant: Date, hour: number): Date {
  const local = parisParts(instant);
  // Date UTC de minuit servant uniquement de calcul de jour de la semaine.
  const dayNumber = Date.UTC(local.year, local.month - 1, local.day);
  const daysBack = local.weekday === 0 ? 7 : local.weekday;
  const sundayDayNumber = dayNumber - daysBack * 24 * 60 * 60 * 1000;
  const sunday = new Date(sundayDayNumber);
  return parisInstant(
    sunday.getUTCFullYear(),
    sunday.getUTCMonth() + 1,
    sunday.getUTCDate(),
    hour,
    0
  );
}