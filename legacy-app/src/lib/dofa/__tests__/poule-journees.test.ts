/**
 * Tests — parsePouleJournees / validateJourneesPayload
 * (src/lib/dofa/poule-journees.ts)
 *
 * Le coach colle le JSON de la page `poule_journees` du site DOFA dans un
 * SECOND champ (distinct du collage des matchs). Cette liste porte le VRAI
 * calendrier des journées du site (numéro + libellé + date officielle) :
 * c'est elle qui permet d'étiqueter les résultats de la poule par journée
 * réelle, au lieu des numéros SYNTHÉTIQUES des matchs générés en
 * round-robin.
 *
 * Contract de `parsePouleJournees` (fonction pure, jamais d'exception) :
 *   - accepte tableau nu OU enveloppe Hydra `{ "hydra:member": [...] }` ;
 *   - extrait `{ number, name, date }` de chaque item ;
 *   - ignore silencieusement un item sans `number` entier >= 1 ;
 *   - `date` priorise `_date` puis `pj_dat_class_offi`.
 *
 * Contract de `validateJourneesPayload` (frontière de confiance, comme
 * `validateIngestPayload`) :
 *   1. JSON invalide                          → reject "invalid_json".
 *   2. Ni tableau nu ni enveloppe Hydra       → reject "invalid_shape".
 *   3. Plus de MAX_JOURNEES journées          → reject "too_many_journees".
 *   4. Plus de MAX_JOURNEES_BYTES octets      → reject "payload_too_large".
 *   5. Parse strict : un item ignoré par le parseur (number invalide) →
 *      rejet global du lot, jamais de sous-ensemble.
 *   6. Numéro dupliqué                        → reject "duplicate_journees".
 *   7. Journées triées par numéro croissant.
 */

import { describe, it, expect } from "vitest";
import {
  parsePouleJournees,
  validateJourneesPayload,
  MAX_JOURNEES,
  MAX_JOURNEES_MATCHES,
} from "@/lib/dofa/poule-journees";

function makeJournee(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 1,
    name: "Journée 1",
    _date: "2026-09-06T00:00:00+00:00",
    pj_no_tour: null,
    pj_lib_tour: null,
    pj_dat_class_auto: null,
    pj_dat_class_offi: "2026-09-06T00:00:00+00:00",
    poule: "/api/.../poules/4",
    phase: "/api/.../phases/1",
    competition: "/api/.../compets/457587",
    matchs: ["/api/.../matchs/1", "/api/.../matchs/2"],
    external_updated_at: "2026-09-01T00:00:00+00:00",
    id: "/api/.../journees/1",
    at_least_one_match_resultat: true,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe("parsePouleJournees — forme Hydra (page /poule_journees)", () => {
  it("ose la forme nominale et ne conserve que number/name/date", () => {
    const data = {
      "hydra:member": [makeJournee(), makeJournee({ number: 2, name: "Journée 2" })],
      "hydra:totalItems": 2,
    };
    const journees = parsePouleJournees(data);
    expect(journees).toHaveLength(2);
    expect(journees[0]).toEqual({ number: 1, name: "Journée 1", date: "2026-09-06T00:00:00+00:00" });
    expect(journees[1].number).toBe(2);
  });

  it("accepte aussi un tableau nu", () => {
    const data = [makeJournee()];
    const journees = parsePouleJournees(data);
    expect(journees).toEqual([{ number: 1, name: "Journée 1", date: "2026-09-06T00:00:00+00:00" }]);
  });

  it("retourne [] sur un payload sans forme reconnue", () => {
    expect(parsePouleJournees(null)).toEqual([]);
    expect(parsePouleJournees({ foo: "bar" })).toEqual([]);
    expect(parsePouleJournees("texte")).toEqual([]);
  });

  it("ignore un item sans number entier >= 1", () => {
    const data = [makeJournee(), clone(makeJournee({ number: "1" })), makeJournee({ number: 0 }), makeJournee({ number: 1.5 }), {}, null];
    const journees = parsePouleJournees(data);
    expect(journees).toHaveLength(1);
  });

  it("réplie date sur pj_dat_class_offi quand _date est absent", () => {
    const data = [{ number: 3, name: "Journée 3", pj_dat_class_offi: "2026-09-13T00:00:00+00:00" }];
    expect(parsePouleJournees(data)[0].date).toBe("2026-09-13T00:00:00+00:00");
  });

  it("name nullable, date nullable", () => {
    const data = [{ number: 4 }];
    expect(parsePouleJournees(data)[0]).toEqual({ number: 4, name: null, date: null });
  });
});

describe("validateJourneesPayload — frontière de confiance", () => {
  it("1. rejette un JSON invalide", () => {
    const result = validateJourneesPayload({ rawBody: "{ pas du json" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_json");
  });

  it("2. rejette une forme inattendue (ni tableau, ni Hydra)", () => {
    const result = validateJourneesPayload({ rawBody: JSON.stringify({ nombre: 2 }) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_shape");
  });

  it("3. rejette un lot de plus de MAX_JOURNEES journées", () => {
    const items = Array.from({ length: MAX_JOURNEES + 1 }, (_, i) => makeJournee({ number: i + 1 }));
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_journees");
  });

  it("3. accepte exactement MAX_JOURNEES journées", () => {
    const items = Array.from({ length: MAX_JOURNEES }, (_, i) => {
      // On allège l'item (pas de matchs ni de sous-ressources) pour rester
      // sous MAX_JOURNEES_BYTES tout en atteignant le plafond de volume.
      return { number: i + 1, name: `Journée ${i + 1}`, _date: "2026-09-06T00:00:00+00:00" };
    });
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.journees).toHaveLength(MAX_JOURNEES);
  });

  it("5. rejette un lot dont un item est invalide (jamais de sous-ensemble)", () => {
    const items = [makeJournee(), makeJournee({ number: "deux" }), makeJournee({ number: 3 })];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_journees");
  });

  it("6. rejette un numéro dupliqué", () => {
    const items = [makeJournee(), makeJournee({ _date: null })];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("duplicate_journees");
  });

  it("7. trie les journées par numéro croissant", () => {
    const items = [makeJournee({ number: 5 }), makeJournee({ number: 1 }), makeJournee({ number: 3 })];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.journees.map((j) => j.number)).toEqual([1, 3, 5]);
    }
  });

  it("accorde une valeur ok sur un payload nominal", () => {
    const items = [makeJournee()];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result).toEqual({
      ok: true,
      journees: [{ number: 1, name: "Journée 1", date: "2026-09-06T00:00:00+00:00" }],
      matches: [],
      triplet: null,
    });
  });

  it("neutralise le HTML/JS dans les libellés", () => {
    const items = [makeJournee({ name: "<script>alert(1)</script>Journée <b>1</b>" })];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.journees[0].name).toBe("alert(1)Journée 1");
  });

  it("ignore une liste `matchs` d'IRI (pas d'objets) — étiquetage seul", () => {
    const items = [makeJournee()];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matches).toEqual([]);
      expect(result.triplet).toBeNull();
    }
  });
});

// ─── Matchs embarqués dans les journées ───────────────────────────────────────

function makeEmbeddedMatch(maNo: number): Record<string, unknown> {
  return {
    ma_no: maNo,
    date: "2026-09-20T00:00:00+00:00",
    time: "15H00",
    home: { club: { cl_no: 101 }, number: 1, short_name: "ECC 1" },
    away: { club: { cl_no: 102 }, number: 1, short_name: "OL 1" },
    home_score: 2,
    away_score: 1,
  };
}

function makeJourneeWithMatches(number: number, matches: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number,
    name: `Journée ${number}`,
    _date: "2026-09-19T00:00:00+00:00",
    competition: { cp_no: 457592, name: "U14 D1", level: "D" },
    phase: { number: 1, type: "CH", name: "PHASE 1" },
    poule: { stage_number: 1, name: "POULE A", gp_diff_no_tour: 0 },
    matchs: matches,
    ...overrides,
  };
}

describe("validateJourneesPayload — matchs embarqués", () => {
  it("importe les matchs embarqués quand ils sont développés (objets)", () => {
    const items = [
      makeJourneeWithMatches(1, [makeEmbeddedMatch(101), makeEmbeddedMatch(102)]),
      makeJourneeWithMatches(2, [makeEmbeddedMatch(201)]),
    ];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.journees).toHaveLength(2);
    expect(result.matches).toHaveLength(3);
    expect(result.matches.map((m) => m.maNo).sort()).toEqual([101, 102, 201]);
    expect(result.triplet).toEqual({ cp_no: 457592, phase: 1, poule: 1 });
    // Le matchday est repris de la journée parente (les objets développés
    // n'ont pas de poule_journee imbriquée).
    expect(result.matches.every((m) => m.matchday === 1 || m.matchday === 2)).toBe(true);
    expect(result.matches.find((m) => m.maNo === 101)?.matchday).toBe(1);
    expect(result.matches.find((m) => m.maNo === 201)?.matchday).toBe(2);
  });

  it("rejette un lot dont un match embarqué est invalide (jamais de sous-ensemble)", () => {
    const items = [
      makeJourneeWithMatches(1, [makeEmbeddedMatch(101), { ma_no: 102, date: "2026-09-20T00:00:00+00:00" }]),
    ];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_matchs");
  });

  it("rejette un lot sans triplet déclaré exploitable (ancre anti-injection manquante)", () => {
    const items = [{ number: 1, name: "Journée 1", matchs: [makeEmbeddedMatch(101)] }];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("triplet_mismatch");
  });

  it("rejette un lot dont les journées déclarent des triplets incohérents", () => {
    const items = [
      makeJourneeWithMatches(1, [makeEmbeddedMatch(101)]),
      makeJourneeWithMatches(
        2,
        [makeEmbeddedMatch(201)],
        { competition: { cp_no: 999999, name: "Autre", level: "D" } }
      ),
    ];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("triplet_mismatch");
  });

  it("conserve le matchday porté par le match embarqué quand il existe", () => {
    const embedded = { ...makeEmbeddedMatch(101), poule_journee: { number: 4, name: "4" } };
    const result = validateJourneesPayload({ rawBody: JSON.stringify([makeJourneeWithMatches(1, [embedded])]) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.matches[0].matchday).toBe(4);
  });

  it("rejette un lot dépassant MAX_JOURNEES_MATCHES matchs embarqués", () => {
    const matches = Array.from({ length: MAX_JOURNEES_MATCHES + 1 }, (_, i) => makeEmbeddedMatch(i + 1));
    const items = [makeJourneeWithMatches(1, matches)];
    const result = validateJourneesPayload({ rawBody: JSON.stringify(items) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_matchs");
  });
});