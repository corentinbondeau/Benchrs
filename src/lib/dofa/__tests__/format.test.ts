import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { formatDofaKickoff } from "../format";

/**
 * `formatDofaKickoff` affiche l'heure LECTEUR : le résultat dépend donc du
 * fuseau de la machine. La CI tourne en UTC alors qu'un coach est en
 * Europe/Paris — sans cette fonction, le même test ne pourrait pas être vrai
 * dans les deux. Le fuseau est fixé explicitement.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = "Europe/Paris";
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

/** Force un fuseau le temps du test, puis restaure. */
function inTimezone(tz: string, run: () => void) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    run();
  } finally {
    process.env.TZ = previous;
  }
}

describe("formatDofaKickoff — fuseau du coach (Europe/Paris)", () => {
  // Le `kickoff` importé est un INSTANT UTC : le bug historique était de le
  // découper (`slice(11, 16)`), ce qui affichait « 13:00 » pour un coup
  // d'envoi annoncé à 15h00 par la FFF.
  it("affiche l'heure de Paris, pas l'heure UTC", () => {
    // 13:00Z = 15h00 à Paris (CEST, UTC+2).
    expect(formatDofaKickoff("2026-09-06T13:00:00.000Z")).toBe("06/09 à 15:00");
  });

  it("tient compte du changement d'heure (UTC+1 en hiver, UTC+2 en été)", () => {
    // 14:00Z en janvier = 15h00 Paris ; 13:00Z en juillet = 15h00 Paris.
    expect(formatDofaKickoff("2026-01-18T14:00:00.000Z")).toBe("18/01 à 15:00");
    expect(formatDofaKickoff("2026-07-05T13:00:00.000Z")).toBe("05/07 à 15:00");
  });

  it("n'affiche que la date pour un coup d'envoi à minuit", () => {
    // 22:00Z la veille = 00h00 le lendemain à Paris : la date affichée suit
    // l'heure locale, pas celle de la chaîne UTC.
    expect(formatDofaKickoff("2026-09-05T22:00:00.000Z")).toBe("06/09");
  });

  it("complète les minutes (15h05, 15h00)", () => {
    expect(formatDofaKickoff("2026-09-06T13:05:00.000Z")).toBe("06/09 à 15:05");
    expect(formatDofaKickoff("2026-09-06T13:00:00.000Z")).toBe("06/09 à 15:00");
  });

  it("accepte aussi un horodatage sans suffixe Z", () => {
    expect(formatDofaKickoff("2026-09-06T15:00:00")).toBe("06/09 à 15:00");
  });

  it("suit le fuseau du lecteur plutôt qu'une heure française codée en dur", () => {
    inTimezone("UTC", () => {
      // Sous UTC, l'instant s'affiche tel quel — c'est exactement la valeur
      // que renvoyait l'ancien découpage de chaîne, et c'est pourquoi le bug
      // passait la CI (qui tourne en UTC) sans jamais être vu.
      expect(formatDofaKickoff("2026-09-06T13:00:00.000Z")).toBe("06/09 à 13:00");
    });
    inTimezone("Asia/Tokyo", () => {
      expect(formatDofaKickoff("2026-09-06T13:00:00.000Z")).toBe("06/09 à 22:00");
    });
  });

  it("renvoie une chaîne vide si l'horaire est absent ou illisible", () => {
    expect(formatDofaKickoff(null)).toBe("");
    expect(formatDofaKickoff(undefined)).toBe("");
    expect(formatDofaKickoff("")).toBe("");
    expect(formatDofaKickoff("pas-une-date")).toBe("");
  });
});