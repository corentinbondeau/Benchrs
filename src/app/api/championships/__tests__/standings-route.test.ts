/**
 * Tests — Contrat de /api/championships/standings (POST/PATCH/DELETE)
 *
 * Saisie manuelle des scores des matchs de la poule (notamment ceux qui
 * n'impliquent PAS le club suivi, que l'import DOFA ne ramène jamais).
 *
 * Contrat verrouillé ici :
 *   POST
 *   1. 401 sans authentification.
 *   2. 400 sur corps JSON malformé (jamais 500).
 *   3. 403 si l'utilisateur n'est pas coach de l'équipe propriétaire du
 *      championnat, via `isTeamCoach` — jamais `isTeamMember`.
 *   4. 403 aussi si le championnat n'existe pas.
 *   5. 400 si championship_id est absent.
 *   6. 400 si les équipes (noms) sont absentes.
 *   7. 400 si l'identité DOFA (cl_no/number) est absente.
 *   8. 400 si les deux équipes sont identiques.
 *   9. 400 si les scores sont invalides (négatif, ou un seul des deux
 *      renseigné) — le contrat score est "les deux ensemble ou rien".
 *  10. 200 : la ligne est insérée avec `source = 'manual'` et un score
 *      `null`/`null` pour un match non joué (jamais 0-0 par défaut).
 *   PATCH
 *  11. 403 sans coach.
 *  12. 400 si id absent.
 *  13. 400 si home_score/away_score absents ou invalides.
 *  14. 404 si le match n'existe pas dans ce championnat.
 *  15. 200 : les scores sont mis à jour et les flags de forfait sont
 *      réarmés à `false` (un score réel saisi prime sur un forfait DOFA).
 *   DELETE
 *  16. 403 sans coach.
 *  17. 404 si le match n'existe pas.
 *  18. 400 si la ligne provient de l'import DOFA (source !== 'manual') —
 *      jamais de suppression de données importées via cette route.
 *  19. 200 : la ligne manuelle est supprimée.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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
  isTeamMember: vi.fn(),
}));

interface StandingsMockState {
  championship: { id: string; team_id: string } | null;
  existingRow: { id: string; source: string } | null;
  insertError: { message: string } | null;
  updateError: { message: string } | null;
  deleteError: { message: string } | null;
}

let mockState: StandingsMockState;
let lastInsert: Record<string, unknown> | null;
let lastUpdate: Record<string, unknown> | null;

function resetMockState() {
  mockState = {
    championship: { id: "champ-1", team_id: "team-1" },
    existingRow: { id: "row-1", source: "manual" },
    insertError: null,
    updateError: null,
    deleteError: null,
  };
  lastInsert = null;
  lastUpdate = null;
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
        };
      }
      if (table === "championship_standings") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockState.existingRow, error: null }),
                select: () => ({
                  single: async () =>
                    mockState.updateError
                      ? { data: null, error: mockState.updateError }
                      : { data: { id: "row-1", ...(lastUpdate ?? {}) }, error: null },
                }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            lastInsert = payload;
            return {
              select: () => ({
                single: async () =>
                  mockState.insertError
                    ? { data: null, error: mockState.insertError }
                    : { data: { id: "row-created", ...payload }, error: null },
              }),
            };
          },
          update: (patch: Record<string, unknown>) => {
            lastUpdate = patch;
            return {
              eq: () => ({
                eq: () => ({
                  select: () => ({
                    single: async () =>
                      mockState.updateError
                        ? { data: null, error: mockState.updateError }
                        : { data: { id: "row-1", ...patch }, error: null },
                  }),
                }),
              }),
            };
          },
          delete: () => ({
            eq: () => ({
              eq: () => ({ data: null, error: mockState.deleteError }),
            }),
          }),
        };
      }
      throw new Error(`Table non mockée dans ce test standings : ${table}`);
    },
  })),
}));

import { getAuthUser, isTeamCoach, isTeamMember } from "@/lib/api-auth";

function makeAuthedUser() {
  return { id: "user-1" } as never;
}

function makeRequest(method: "POST" | "PATCH" | "DELETE", body: unknown): Request {
  return new Request("http://localhost/api/championships/standings", {
    method,
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_MATCH = {
  championship_id: "champ-1",
  home_team: "ECC",
  away_team: "PEVELE FC",
  home_cl_no: 100,
  home_team_number: 1,
  away_cl_no: 200,
  away_team_number: 6,
  home_score: 2,
  away_score: 1,
};

async function importRoute() {
  return import("@/app/api/championships/standings/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMockState();
});

describe("POST /api/championships/standings — authentification", () => {
  it("répond 401 si aucun utilisateur authentifié", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await importRoute();
    const res = await POST(makeRequest("POST", VALID_MATCH));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/championships/standings — autorisation coach", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
  });

  it("répond 403 si l'utilisateur n'est pas coach", async () => {
    vi.mocked(isTeamCoach).mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(makeRequest("POST", VALID_MATCH));

    expect(res.status).toBe(403);
    expect(vi.mocked(isTeamCoach)).toHaveBeenCalledWith("user-1", "team-1");
    expect(
      vi.mocked(isTeamMember),
      "cette écriture doit être tranchée via isTeamCoach, jamais isTeamMember"
    ).not.toHaveBeenCalled();
  });

  it("répond 403 si le championnat n'existe pas", async () => {
    mockState.championship = null;
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const { POST } = await importRoute();
    const res = await POST(makeRequest("POST", VALID_MATCH));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/championships/standings — validation", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("répond 400 sur un corps JSON malformé", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest("POST", "{ not json"));
    expect(res.status).toBe(400);
  });

  it("répond 400 si championship_id est absent", async () => {
    const { POST } = await importRoute();
    const rest = { ...VALID_MATCH } as Partial<typeof VALID_MATCH>;
    delete rest.championship_id;
    const res = await POST(makeRequest("POST", rest));
    expect(res.status).toBe(400);
  });

  it("répond 400 si les noms d'équipes sont absents", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest("POST", { ...VALID_MATCH, away_team: "" }));
    expect(res.status).toBe(400);
  });

  it("répond 400 si l'identité DOFA est absente", async () => {
    const { POST } = await importRoute();
    const rest = { ...VALID_MATCH } as Partial<typeof VALID_MATCH>;
    delete rest.away_cl_no;
    delete rest.away_team_number;
    const res = await POST(makeRequest("POST", rest));
    expect(res.status).toBe(400);
  });

  it("répond 400 si les deux équipes sont identiques", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest("POST", { ...VALID_MATCH, away_cl_no: VALID_MATCH.home_cl_no, away_team_number: VALID_MATCH.home_team_number })
    );
    expect(res.status).toBe(400);
  });

  it("répond 400 sur un score négatif", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest("POST", { ...VALID_MATCH, away_score: -1 }));
    expect(res.status).toBe(400);
  });

  it("répond 400 si un seul score est renseigné", async () => {
    const { POST } = await importRoute();
    const rest = { ...VALID_MATCH } as Partial<typeof VALID_MATCH>;
    delete rest.away_score;
    const res = await POST(makeRequest("POST", rest));
    expect(res.status).toBe(400);
  });

  it("répond 200 et insère une ligne source='manual' avec les scores", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest("POST", VALID_MATCH));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(lastInsert?.source).toBe("manual");
    expect(lastInsert?.home_team).toBe("ECC");
    expect(lastInsert?.home_score).toBe(2);
    expect(lastInsert?.away_score).toBe(1);
    expect(body.id).toBe("row-created");
  });

  it("répond 200 avec des scores null pour un match non joué (jamais 0-0)", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest("POST", { ...VALID_MATCH, home_score: null, away_score: null })
    );
    expect(res.status).toBe(200);
    expect(lastInsert?.home_score).toBeNull();
    expect(lastInsert?.away_score).toBeNull();
  });
});

describe("PATCH /api/championships/standings — mise à jour des scores", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("répond 400 si id est absent", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makeRequest("PATCH", { championship_id: "champ-1", home_score: 1, away_score: 0 }));
    expect(res.status).toBe(400);
  });

  it("répond 400 si les scores sont absents", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makeRequest("PATCH", { id: "row-1", championship_id: "champ-1" }));
    expect(res.status).toBe(400);
  });

  it("répond 400 sur des scores invalides", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makeRequest("PATCH", { id: "row-1", championship_id: "champ-1", home_score: 1 }));
    expect(res.status).toBe(400);
  });

  it("répond 404 si le match n'existe pas", async () => {
    mockState.existingRow = null;
    const { PATCH } = await importRoute();
    const res = await PATCH(makeRequest("PATCH", { id: "row-inconnu", championship_id: "champ-1", home_score: 1, away_score: 1 }));
    expect(res.status).toBe(404);
  });

  it("répond 200, met à jour les scores et réarme les forfaits", async () => {
    mockState.existingRow = { id: "row-1", source: "dofa_import" };
    const { PATCH } = await importRoute();
    const res = await PATCH(makeRequest("PATCH", { id: "row-1", championship_id: "champ-1", home_score: 0, away_score: 3 }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(lastUpdate?.home_score).toBe(0);
    expect(lastUpdate?.away_score).toBe(3);
    expect(lastUpdate?.home_is_forfeit).toBe(false);
    expect(lastUpdate?.away_is_forfeit).toBe(false);
    expect(body.id).toBe("row-1");
  });
});

describe("DELETE /api/championships/standings — suppression des matchs manuels", () => {
  beforeEach(() => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
  });

  it("répond 404 si le match n'existe pas", async () => {
    mockState.existingRow = null;
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest("DELETE", { id: "row-introuvable", championship_id: "champ-1" }));
    expect(res.status).toBe(404);
  });

  it("répond 400 si la ligne provient de l'import DOFA", async () => {
    mockState.existingRow = { id: "row-import", source: "dofa_import" };
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest("DELETE", { id: "row-import", championship_id: "champ-1" }));
    expect(res.status).toBe(400);
  });

  it("répond 200 et supprime une ligne manuelle", async () => {
    const { DELETE } = await importRoute();
    const res = await DELETE(makeRequest("DELETE", { id: "row-1", championship_id: "champ-1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockState.deleteError).toBeNull();
  });
});