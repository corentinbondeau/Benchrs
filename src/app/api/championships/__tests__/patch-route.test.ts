/**
 * Tests — Contrat de PATCH /api/championships (LOT 10, glue)
 *
 * Persiste le triplet DOFA (dofa_cp_no, dofa_phase, dofa_poule) sur un
 * championnat déjà créé. Sans cette route, la saisie d'URL de poule côté
 * UI serait purement cosmétique (rien n'est jamais écrit en base).
 *
 * Contrat verrouillé ici :
 *   1. 401 si aucun utilisateur authentifié.
 *   2. 403 si l'utilisateur n'est pas coach de l'équipe propriétaire du
 *      championnat visé — via `isTeamCoach`, JAMAIS `isTeamMember` (c'est
 *      une écriture).
 *   3. 403 également si le championnat n'existe pas (pas de distinction
 *      "n'existe pas" / "pas autorisé" côté client).
 *   4. 400 si `id` est absent / pas une chaîne.
 *   5. 400 si le triplet cpNo/phase/poule est absent, non numérique ou
 *      non entier.
 *   6. 400 sur corps JSON malformé — jamais 500. ⚠️ EN RED AUJOURD'HUI :
 *      `await req.json()` n'est pas protégé par la route.
 *   7. 409 si la contrainte d'unicité (team_id, dofa_cp_no, dofa_phase,
 *      dofa_poule) est violée (code Postgres 23505), avec message
 *      compréhensible.
 *   8. Erreur base non gérée → message générique, sans `error.message`
 *      brut (pas de nom de colonne/contrainte/table). ⚠️ EN RED
 *      AUJOURD'HUI : la route renvoie actuellement `error.message` tel
 *      quel — même faiblesse proscrite sur la route d'ingestion (lot 7).
 *   9. 200 nominal : le triplet est persisté, la ressource à jour est
 *      retournée.
 *
 * Stratégie de mock : alignée sur `dofa-route.test.ts` /
 * `ingest-route.test.ts` — `@/lib/api-auth` et `@/lib/supabase/admin`
 * mockés, aucune troisième convention introduite.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
  // Présent uniquement pour détecter une régression si la route l'utilisait
  // par erreur à la place de isTeamCoach (test dédié plus bas).
  isTeamMember: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock : @/lib/supabase/admin — état contrôlable par test
// ---------------------------------------------------------------------------
interface SupabaseMockState {
  championship: { id: string; team_id: string } | null;
  updateError: { code?: string; message: string } | null;
  updatedRow: Record<string, unknown> | null;
}

let mockState: SupabaseMockState;
let updatePatch: Record<string, unknown> | null = null;

function resetSupabaseMockState() {
  mockState = {
    championship: { id: "champ-1", team_id: "team-1" },
    updateError: null,
    updatedRow: { id: "champ-1", team_id: "team-1", dofa_cp_no: 457587, dofa_phase: 1, dofa_poule: 4 },
  };
  updatePatch = null;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "championships") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockState.championship, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => {
            updatePatch = patch;
            return {
              eq: () => ({
                select: () => ({
                  single: async () => {
                    if (mockState.updateError) {
                      return { data: null, error: mockState.updateError };
                    }
                    return { data: mockState.updatedRow, error: null };
                  },
                }),
              }),
            };
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
const TRIPLET = { cpNo: 457587, phase: 1, poule: 4 };

function makeAuthedUser() {
  return { id: "user-1" } as never;
}

function makePatchRequest(body: unknown): Request {
  return new Request("http://localhost/api/championships", {
    method: "PATCH",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return { id: "champ-1", ...TRIPLET, ...overrides };
}

async function importRoute() {
  return import("@/app/api/championships/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSupabaseMockState();
});

describe("PATCH /api/championships — authentification", () => {
  it("répond 401 si aucun utilisateur authentifié", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody()));

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/championships — autorisation coach (⚠️ pas simple membre)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
  });

  it("répond 403 si l'utilisateur n'est pas coach de l'équipe propriétaire du championnat", async () => {
    vi.mocked(isTeamCoach).mockResolvedValue(false);

    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody()));

    expect(res.status).toBe(403);
    expect(
      vi.mocked(isTeamCoach),
      "la route doit trancher l'autorisation d'écriture via isTeamCoach"
    ).toHaveBeenCalledWith("user-1", "team-1");
    expect(
      vi.mocked(isTeamMember),
      "isTeamMember ne doit jamais être appelé par cette route : c'est une écriture réservée au coach"
    ).not.toHaveBeenCalled();
  });

  it("répond 403 si le championnat visé n'existe pas (pas de distinction avec 'pas autorisé')", async () => {
    mockState.championship = null;
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody({ id: "champ-inconnu" })));

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/championships — validation du corps", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("répond 400 si id est absent", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest({ ...TRIPLET }));

    expect(res.status).toBe(400);
  });

  it("répond 400 si id n'est pas une chaîne", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest({ id: 123, ...TRIPLET }));

    expect(res.status).toBe(400);
  });

  it("répond 400 si le triplet est absent", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest({ id: "champ-1" }));

    expect(res.status).toBe(400);
  });

  it("répond 400 si un champ du triplet est décimal (non entier)", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody({ phase: 1.5 })));

    expect(res.status).toBe(400);
  });

  it("répond 400 si un champ du triplet est une chaîne", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody({ poule: "4" })));

    expect(res.status).toBe(400);
  });

  it("⚠️ EN RED — répond 400 (pas 500) sur un corps JSON malformé", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest("{ id: not valid json"));

    expect(
      res.status,
      "un corps JSON malformé doit produire une erreur client (400), pas un crash serveur (500)"
    ).toBe(400);
  });
});

describe("PATCH /api/championships — conflit d'unicité (409)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("répond 409 avec un message compréhensible si la poule est déjà attachée à un autre championnat de l'équipe", async () => {
    mockState.updateError = { code: "23505", message: 'duplicate key value violates unique constraint "championships_team_dofa_unique"' };

    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(String(json.error ?? "")).toMatch(/poule/i);
    expect(String(json.error ?? "")).toMatch(/déjà/i);
    expect(String(json.error ?? "")).not.toMatch(/constraint|SQLSTATE|championships_team_dofa_unique/i);
  });
});

describe("PATCH /api/championships — erreur base non gérée (⚠️ EN RED)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("⚠️ SÉCURITÉ — ne renvoie jamais error.message brut au client sur une erreur DB non gérée", async () => {
    mockState.updateError = {
      message: 'column "dofa_cp_no" of relation "championships" violates check constraint "chk_dofa_cp_no_positive"',
    };

    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody()));
    const json = await res.json();

    expect(
      String(json.error ?? ""),
      `le message client ne doit jamais exposer de détail interne — reçu : ${JSON.stringify(json)}`
    ).not.toMatch(/column|relation|constraint|chk_dofa_cp_no_positive|championships/i);
  });
});

describe("PATCH /api/championships — nominal (200)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("persiste le triplet DOFA et retourne le championnat mis à jour", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody()));
    const json = await res.json();

    expect(res.status, `attendu 200, reçu ${res.status} — body=${JSON.stringify(json)}`).toBe(200);
    expect(updatePatch).toEqual({
      dofa_cp_no: TRIPLET.cpNo,
      dofa_phase: TRIPLET.phase,
      dofa_poule: TRIPLET.poule,
    });
    expect(json).toEqual(expect.objectContaining(mockState.updatedRow));
  });
});

// ---------------------------------------------------------------------------
// Extension — identité d'équipe (dofa_cl_no / dofa_team_number)
//
// Contexte (correctif « agenda vide ») : le triplet de poule seul ne suffit
// pas à `planEventSync`, qui filtre désormais sur l'identité de l'équipe du
// coach (dofa_cl_no + dofa_team_number). Cette identité est choisie par le
// coach dans la liste reconstituée par `extractPouleTeams` (cf.
// poule-teams.test.ts), puis envoyée à ce PATCH — soit en même temps que le
// triplet, soit dans un second appel une fois la poule déjà configurée.
//
// ⚠️ Ces tests n'altèrent AUCUN cas existant ci-dessus : même mock, même
// convention isTeamCoach/isTeamMember, même structure de réponse.
// ---------------------------------------------------------------------------

describe("PATCH /api/championships — identité d'équipe (clNo/teamNumber)", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("persiste le triplet ET l'identité d'équipe lorsque clNo/teamNumber sont fournis", async () => {
    mockState.updatedRow = {
      ...mockState.updatedRow,
      dofa_cl_no: 10428,
      dofa_team_number: 1,
    };

    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest(validBody({ clNo: 10428, teamNumber: 1 }))
    );
    const json = await res.json();

    expect(res.status, `attendu 200, reçu ${res.status} — body=${JSON.stringify(json)}`).toBe(200);
    expect(updatePatch).toEqual({
      dofa_cp_no: TRIPLET.cpNo,
      dofa_phase: TRIPLET.phase,
      dofa_poule: TRIPLET.poule,
      dofa_cl_no: 10428,
      dofa_team_number: 1,
    });
  });

  it("rétrocompatibilité : accepte une requête ne portant que le triplet, sans identité d'équipe", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makePatchRequest(validBody()));

    expect(
      res.status,
      "le coach doit pouvoir configurer sa poule avant de choisir son équipe"
    ).toBe(200);
    expect(updatePatch).toEqual({
      dofa_cp_no: TRIPLET.cpNo,
      dofa_phase: TRIPLET.phase,
      dofa_poule: TRIPLET.poule,
    });
    expect(updatePatch).not.toHaveProperty("dofa_cl_no");
    expect(updatePatch).not.toHaveProperty("dofa_team_number");
  });

  it("répond 400 si clNo est fourni mais n'est pas un entier", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest(validBody({ clNo: "10428", teamNumber: 1 }))
    );

    expect(res.status).toBe(400);
  });

  it("répond 400 si teamNumber est fourni mais n'est pas un entier (décimal)", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(
      makePatchRequest(validBody({ clNo: 10428, teamNumber: 1.5 }))
    );

    expect(res.status).toBe(400);
  });
});
