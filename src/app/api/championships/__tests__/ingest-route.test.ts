/**
 * Tests — Contrat de POST /api/championships/dofa/ingest (LOT 7)
 *
 * ⚠️ Endpoint le plus sensible du chantier : reçoit un payload provenant du
 * navigateur du coach (bookmarklet, lot 8), lui-même relayé depuis un site
 * tiers (FFF/DOFA). Rien ne garantit l'origine ni l'intégrité du contenu.
 *
 * Contrat verrouillé ici :
 *   1. 401 si aucun utilisateur authentifié (`getAuthUser`).
 *   2. 403 si l'utilisateur n'est PAS coach de la `teamId` visée — via
 *      `isTeamCoach`, JAMAIS `isTeamMember` (⚠️ ne pas reproduire la
 *      faiblesse de la route `dofa` existante, qui se contente d'un
 *      simple membership pour une opération de LECTURE ; ici c'est une
 *      ÉCRITURE, réservée au coach).
 *   3. 400 sur payload invalide (`validateIngestPayload` — réutilisée
 *      réellement, non mockée, cf. ingest-validation.test.ts), avec un
 *      message actionnable mais SANS détail interne (pas de stack, pas de
 *      nom de colonne SQL, pas de message d'erreur Postgres brut).
 *   4. 200 nominal : n matchs upsertés, réponse
 *      `{ imported, updated, skipped, source }`.
 *   5. Idempotence : un second appel identique ne duplique rien ; les
 *      matchs déjà connus (par `dofa_ma_no`) remontent en `updated`, pas
 *      en `imported`.
 *   6. ANTI-RÉGRESSION CAPITALE : un payload de matchs VIDE ne doit
 *      JAMAIS supprimer les matchs déjà en base pour ce championnat
 *      (absence ≠ suppression). Aucun DELETE ne doit être exécuté.
 *   7. Garde-fou de fréquence : un import relancé moins de 60 secondes
 *      après le précédent (`championships.last_imported_at`) est refusé
 *      (429), sans dépendance de rate-limiting — uniquement basé sur
 *      cette colonne (posée par le lot 6).
 *
 * Hors-scope explicite (cf. TODO lot 7) : pas de test de rate-limiting
 * réel (pas de vraie fenêtre temporelle glissante), pas de test RLS (non
 * exécutable en CI).
 *
 * Stratégie de mock : `@/lib/api-auth` et `@/lib/supabase/admin` sont
 * mockés (aligné sur `dofa-route.test.ts`). `validateIngestPayload` N'EST
 * PAS mockée : elle est pure, testée indépendamment, et sa réutilisation
 * réelle ici garantit que le contrat de la route et celui de la fonction
 * de validation restent synchronisés.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import fixtureRaw from "@/lib/dofa/__fixtures__/resultat-d4-pouleD.json";

// ---------------------------------------------------------------------------
// Mock : @/lib/api-auth
// ---------------------------------------------------------------------------
vi.mock("@/lib/api-auth", () => ({
  getAuthUser: vi.fn(),
  unauthorized: vi.fn(
    () =>
      new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
  ),
  forbidden: vi.fn(
    () =>
      new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
  ),
  isTeamCoach: vi.fn(),
  // Présent uniquement pour détecter une régression si la route l'importait
  // par erreur à la place de isTeamCoach (cf. test dédié plus bas).
  isTeamMember: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock : @/lib/supabase/admin — client générique par table, état contrôlable
// ---------------------------------------------------------------------------
interface SupabaseMockState {
  championship: { id: string; last_imported_at: string | null } | null;
  existingMaNos: number[];
}

let mockState: SupabaseMockState;
let upsertedRows: Array<Record<string, unknown>> = [];
let updatedChampionshipPatch: Record<string, unknown> | null = null;
let deleteCalled = false;

function resetSupabaseMockState() {
  mockState = { championship: { id: "champ-1", last_imported_at: null }, existingMaNos: [] };
  upsertedRows = [];
  updatedChampionshipPatch = null;
  deleteCalled = false;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "championships") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: mockState.championship, error: null }),
                }),
              }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            updatedChampionshipPatch = patch;
            return { eq: async () => ({ error: null }) };
          },
        };
      }

      if (table === "championship_standings") {
        return {
          select: () => ({
            eq: async () => ({
              data: mockState.existingMaNos.map((n) => ({ dofa_ma_no: n })),
              error: null,
            }),
          }),
          upsert: (rows: Array<Record<string, unknown>>) => {
            upsertedRows = rows;
            return { error: null };
          },
          delete: () => {
            deleteCalled = true;
            return { eq: async () => ({ error: null }) };
          },
        };
      }

      throw new Error(`Table non mockée dans ce test : ${table}`);
    },
  })),
}));

import { getAuthUser, isTeamCoach, isTeamMember } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEAM_ID = "team-1";
const TRIPLET = { cpNo: 457587, phase: 1, poule: 4 };

function makeAuthedUser() {
  return { id: "user-1" } as never;
}

function makeIngestRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/championships/dofa/ingest", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    teamId: TEAM_ID,
    ...TRIPLET,
    matches: fixtureRaw,
    ...overrides,
  };
}

async function importRoute() {
  return import("@/app/api/championships/dofa/ingest/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSupabaseMockState();
});

describe("POST /api/championships/dofa/ingest — authentification", () => {
  it("répond 401 si aucun utilisateur authentifié", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody()));

    expect(res.status).toBe(401);
  });
});

describe("POST /api/championships/dofa/ingest — autorisation coach (⚠️ pas simple membre)", () => {
  it("répond 403 si l'utilisateur n'est pas coach de la teamId visée", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody()));

    expect(res.status).toBe(403);
    expect(
      vi.mocked(isTeamCoach),
      "la route doit appeler isTeamCoach pour trancher l'autorisation d'écriture"
    ).toHaveBeenCalledWith("user-1", TEAM_ID);
  });

  it("⚠️ RÉGRESSION DE SÉCURITÉ — n'utilise jamais isTeamMember pour autoriser l'écriture", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const { POST } = await importRoute();
    await POST(makeIngestRequest(validBody()));

    expect(
      vi.mocked(isTeamMember),
      "isTeamMember ne doit jamais être appelé par cette route : l'écriture est réservée au coach (isTeamCoach)"
    ).not.toHaveBeenCalled();
  });
});

describe("POST /api/championships/dofa/ingest — validation du payload (400 sans détail interne)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("répond 400 si les matchs contiennent un ma_no non numérique", async () => {
    const badMatches = [{ ...fixtureRaw[0], ma_no: "not-a-number" }];

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody({ matches: badMatches })));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(String(json.error ?? "")).not.toMatch(/stack|SQLSTATE|postgres|column|table/i);
  });

  it("répond 400 si un match du lot appartient à un autre triplet (injection d'une autre poule)", async () => {
    const foreign = {
      ...fixtureRaw[0],
      competition: { ...fixtureRaw[0].competition, cp_no: 999999 },
    };

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody({ matches: [foreign] })));

    expect(res.status).toBe(400);
  });

  it("répond 400 si plus de 500 matchs sont fournis", async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      ...fixtureRaw[0],
      ma_no: 90000000 + i,
    }));

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody({ matches: many })));

    expect(res.status).toBe(400);
  });
});

describe("POST /api/championships/dofa/ingest — nominal (200)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("upsert les 3 matchs de la fixture et répond { imported, updated, skipped, source }", async () => {
    mockState.existingMaNos = [];

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody()));
    const json = await res.json();

    expect(res.status, `attendu 200, reçu ${res.status} — body=${JSON.stringify(json)}`).toBe(200);
    expect(json).toEqual(
      expect.objectContaining({
        imported: 3,
        updated: 0,
        skipped: 0,
        source: "dofa_import",
      })
    );
    expect(upsertedRows).toHaveLength(3);
  });
});

describe("POST /api/championships/dofa/ingest — idempotence", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("un second appel identique ne crée aucun doublon : les matchs déjà connus reviennent en `updated`, pas `imported`", async () => {
    // Premier appel : base vide → tout est imported.
    mockState.existingMaNos = [];
    const { POST: post1 } = await importRoute();
    const first = await post1(makeIngestRequest(validBody()));
    const firstJson = await first.json();
    expect(firstJson.imported).toBe(3);
    expect(firstJson.updated).toBe(0);

    // Second appel : les 3 dofa_ma_no existent désormais en base.
    mockState.existingMaNos = fixtureRaw.map((m) => m.ma_no);
    upsertedRows = [];
    const { POST: post2 } = await importRoute();
    const second = await post2(makeIngestRequest(validBody()));
    const secondJson = await second.json();

    expect(
      secondJson.imported,
      `un ré-import identique ne doit rien importer de nouveau (body=${JSON.stringify(secondJson)})`
    ).toBe(0);
    expect(secondJson.updated).toBe(3);
    // Toujours un upsert (clé d'idempotence dofa_ma_no), jamais un doublon inséré.
    expect(upsertedRows).toHaveLength(3);
  });
});

describe("POST /api/championships/dofa/ingest — ANTI-RÉGRESSION CAPITALE : absence ≠ suppression", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("un payload de matchs vide ne supprime JAMAIS les matchs déjà importés", async () => {
    mockState.existingMaNos = fixtureRaw.map((m) => m.ma_no);

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody({ matches: [] })));
    const json = await res.json();

    expect(res.status, `un payload vide doit être un no-op valide, pas une erreur (body=${JSON.stringify(json)})`).toBe(200);
    expect(
      deleteCalled,
      "RÈGLE D'OR : absence de matchs dans le payload ne doit JAMAIS déclencher de DELETE côté DB"
    ).toBe(false);
    expect(json).toEqual(
      expect.objectContaining({ imported: 0, updated: 0, skipped: 0 })
    );
  });
});

describe("POST /api/championships/dofa/ingest — garde-fou de fréquence (60s)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("répond 429 si le dernier import date de moins de 60 secondes", async () => {
    mockState.championship = {
      id: "champ-1",
      last_imported_at: new Date(Date.now() - 5_000).toISOString(),
    };

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody()));

    expect(res.status, "un import relancé 5s après le précédent doit être refusé (429)").toBe(429);
    expect(upsertedRows).toHaveLength(0);
  });

  it("accepte un import relancé plus de 60 secondes après le précédent", async () => {
    mockState.championship = {
      id: "champ-1",
      last_imported_at: new Date(Date.now() - 61_000).toISOString(),
    };

    const { POST } = await importRoute();
    const res = await POST(makeIngestRequest(validBody()));

    expect(res.status).toBe(200);
  });
});
