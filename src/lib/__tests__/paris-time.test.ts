import { describe, expect, it } from "vitest";
import {
  CONVOCATION_SUNDAY_HOUR,
  convocationSlotFor,
} from "@/lib/convocations";
import {
  parisInstant,
  parisOffsetMinutes,
  parisParts,
  sundaySlotBefore,
} from "@/lib/paris-time";

// Heures de Paris exprimées en UTC, arrêtées par l'observatoire : le test
// doit être vrairegardless du fuseau de la machine qui l'exécute, donc on
// compare des instants, jamais des chaînes locales.
describe("paris-time", () => {
  describe("parisOffsetMinutes", () => {
    it("vaut 120 min en été et 60 min en hiver", () => {
      // 2026-06-15 : été, UTC+2
      expect(parisOffsetMinutes(2026, 6, 15, 12, 0)).toBe(120);
      // 2026-01-15 : hiver, UTC+1
      expect(parisOffsetMinutes(2026, 1, 15, 12, 0)).toBe(60);
    });

    it("sait de quel côté du changement d'heure on se trouve", () => {
      // 2026-03-29 : bascule à 02h locales. 00h30 est encore en UTC+1,
      // 03h30 est déjà en UTC+2. Un décalage figé se tromperait sur l'un des deux.
      expect(parisOffsetMinutes(2026, 3, 29, 0, 30)).toBe(60);
      expect(parisOffsetMinutes(2026, 3, 29, 3, 30)).toBe(120);
      // Retour en octobre : 2026-10-25. La bascule UE a lieu à 01h00 UTC
      // (et NON à 03h locales comme aux US) : 00h30 locales = 22h30Z la veille,
      // encore en UTC+2 ; 01h30 locales = 01h30Z, déjà en UTC+1.
      expect(parisOffsetMinutes(2026, 10, 25, 0, 30)).toBe(120);
      expect(parisOffsetMinutes(2026, 10, 25, 1, 30)).toBe(60);
      expect(parisOffsetMinutes(2026, 10, 25, 4, 30)).toBe(60);
    });
  });

  describe("parisInstant", () => {
    it("convertit une heure de Paris en instant UTC, dans les deux saisons", () => {
      // 15h00 de Paris le 6 septembre 2026 = 13h00 UTC (UTC+2)
      expect(parisInstant(2026, 9, 6, 15, 0).toISOString()).toBe(
        "2026-09-06T13:00:00.000Z"
      );
      // 15h00 de Paris le 15 janvier 2026 = 14h00 UTC (UTC+1)
      expect(parisInstant(2026, 1, 15, 15, 0).toISOString()).toBe(
        "2026-01-15T14:00:00.000Z"
      );
    });

    it("fait l'aller-retour avec la lecture locale", () => {
      const built = parisInstant(2026, 7, 4, 18, 45);
      const read = parisParts(built);
      expect({
        year: read.year,
        month: read.month,
        day: read.day,
        hour: read.hour,
        minute: read.minute,
      }).toEqual({ year: 2026, month: 7, day: 4, hour: 18, minute: 45 });
      expect(read.weekday).toBe(6); // un 4 juillet 2026 est un samedi
    });
  });

  describe("sundaySlotBefore", () => {
    it("retombe sur le dimanche précédent à l'heure demandée", () => {
      // Séance le samedi 12/09/2026 à 10h → dimanche 06/09 à 15h Paris.
      const slot = sundaySlotBefore(parisInstant(2026, 9, 12, 10, 0), 15);
      expect(slot.toISOString()).toBe("2026-09-06T13:00:00.000Z");
    });

    it("reste sur le même jour pour une séance du lundi", () => {
      // Séance le lundi 14/09/2026 à 19h → dimanche 13/09 à 15h Paris.
      const slot = sundaySlotBefore(parisInstant(2026, 9, 14, 19, 0), 15);
      expect(slot.toISOString()).toBe("2026-09-13T13:00:00.000Z");
    });

    it("recule d'une semaine pour une séance jouée un dimanche", () => {
      // Dimanche 13/09 à 10h : le dimanche 13/09 à 15h est APRÈS la séance,
      // donc convocation le dimanche 06/09 à 15h, pas le jour même.
      const slot = sundaySlotBefore(parisInstant(2026, 9, 13, 10, 0), 15);
      expect(slot.toISOString()).toBe("2026-09-06T13:00:00.000Z");
    });

    it("franchit le changement d'heure sans dérive", () => {
      // Semaine du 25 octobre 2026 (retour en UTC+1 le 25/10 à 03h).
      // Séance le samedi 31/10 à 10h → dimanche 25/10 à 15h Paris = 14h00 UTC
      // (et non 13h00 : on est repassé en heure d'hiver).
      const slot = sundaySlotBefore(parisInstant(2026, 10, 31, 10, 0), 15);
      expect(slot.toISOString()).toBe("2026-10-25T14:00:00.000Z");
      expect(parisParts(slot).hour).toBe(15);
    });

    it("ne dépend pas du fuseau de la machine qui exécute le test", () => {
      // Le même instant doit produire le même créneau quel que soit TZ du runner.
      // Attention : le 8 février 2026 est un DIMANCHE, et la règle est
      // « strictement avant » → on attend le dimanche 1er février, pas le 8.
      const event = parisInstant(2026, 2, 8, 10, 0);
      const slot = sundaySlotBefore(event, 15);
      expect(slot.toISOString()).toBe("2026-02-01T14:00:00.000Z");
      expect(parisParts(slot)).toMatchObject({ weekday: 0, hour: 15 });
    });
  });
});

describe("convocationSlotFor", () => {
  const now = parisInstant(2026, 9, 1, 9, 0); // mardi 1er septembre, 9h Paris

  it("programme une séance le dimanche 15h qui précède", () => {
    const slot = convocationSlotFor({
      type: "training",
      eventDate: parisInstant(2026, 9, 12, 10, 0).toISOString(),
      leadDays: 3,
      now,
    });
    expect(slot.toISOString()).toBe("2026-09-06T13:00:00.000Z");
    expect(CONVOCATION_SUNDAY_HOUR).toBe(15);
  });

  it("ignore leadDays pour une séance", () => {
    const eventDate = parisInstant(2026, 9, 12, 10, 0).toISOString();
    const withZero = convocationSlotFor({
      type: "training",
      eventDate,
      leadDays: 0,
      now,
    });
    const withSeven = convocationSlotFor({
      type: "training",
      eventDate,
      leadDays: 7,
      now,
    });
    expect(withZero.toISOString()).toBe(withSeven.toISOString());
  });

  it("conserve event_date - leadDays pour un match", () => {
    const slot = convocationSlotFor({
      type: "match",
      eventDate: parisInstant(2026, 9, 12, 15, 0).toISOString(),
      leadDays: 3,
      now,
    });
    expect(slot.toISOString()).toBe("2026-09-09T13:00:00.000Z");
  });

  it("envoie sans attendre si le dimanche 15h est déjà passé", () => {
    // Séance de mardi 8/09 planifiée le lundi 7/09 à 18h : le dimanche 6/09
    // est derrière nous. Plutôt que de perdre la convocation, elle part à now
    // (la route envoie une notification dont `scheduled_for` est dépassé).
    const lateNow = parisInstant(2026, 9, 7, 18, 0);
    const slot = convocationSlotFor({
      type: "training",
      eventDate: parisInstant(2026, 9, 8, 18, 0).toISOString(),
      leadDays: 3,
      now: lateNow,
    });
    expect(slot.toISOString()).toBe(lateNow.toISOString());
  });

  it("renvoie now pour une date illisible plutôt que de planter", () => {
    const slot = convocationSlotFor({
      type: "training",
      eventDate: "pas-une-date",
      leadDays: 3,
      now,
    });
    expect(slot.toISOString()).toBe(now.toISOString());
  });

  it("ne programme jamais une convocation après l'heure de la séance", () => {
    // Invariant de sécurité : la notification doit précéder l'événement.
    for (const iso of [
      parisInstant(2026, 9, 12, 10, 0).toISOString(),
      parisInstant(2026, 9, 14, 19, 0).toISOString(),
      parisInstant(2026, 3, 29, 8, 0).toISOString(),
      parisInstant(2026, 10, 25, 8, 0).toISOString(),
    ]) {
      const slot = convocationSlotFor({
        type: "training",
        eventDate: iso,
        leadDays: 3,
        now: parisInstant(2026, 1, 1, 0, 0),
      });
      expect(slot.getTime()).toBeLessThan(new Date(iso).getTime());
    }
  });
});