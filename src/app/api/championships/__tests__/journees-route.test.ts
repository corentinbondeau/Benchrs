/**
 * Tests — Contrat de /api/championships/journees (POST)
 *
 * Second collage du dialog Import DOFA : la liste officielle des journées
 * de la poule (page `/poule_journees` du site), stockée telle quelle dans
 * `championships.journees`.
 *
 * Contrat verrouillé ici :
 *   1. 401 sans authentification.
 *   2. 400 sur corps JSON malformé (jamais 500).
 *   3. 400 si championship_id est absent.
 *   4. 403 si l'utilisateur n'est pas coach de l'équipe propriétaire du
 *      championnat (`isTeamCoach`, jamais `isTeamMember`).
 *   5. 403 aussi si le championnat n'existe pas.
 *   6. 400 si journees est absent du body.
 *   7. 400 si la liste est invalide (JSON malformé) — via la frontière
 *      pure `validateJourneesPayload`, jamais mockée.
 *   8. 200 : la liste validée (triée par numéro) est persistée via UPDATE
 *      sur `championships.journees` et renvoyée au client.
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

interface JourneesMockState {
  championship: { id: string; team_id: string } | null;
  updateError: { message: string } | null;
}

let mockState: JourneesMockState;
let lastUpdate: Record<string, unknown> | null;

function resetMockState() {
  mockState = {
    championship: { id: "champ-1", team_id: "team-1" },
    updateError: null,
  };
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
          update: (patch: Record<string, unknown>) => {
            lastUpdate = patch;
            return {
              eq: () =>
                mockState.updateError
                  ? { error: mockState.updateError }
                  : { error: null },
            };
          },
        };
      }
      throw new Error(`Table non mockée dans ce test journees : ${table}`);
    },
  })),
}));

import { getAuthUser, isTeamCoach } from "@/lib/api-auth";

function makeAuthedUser() {
  return { id: "user-1" } as never;
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/championships/journees", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_JOURNEES = [
  { number: 3, name: "Journée 3", _date: "2026-09-13T00:00:00+00:00" },
  { number: 1, name: "Journée 1", _date: "2026-09-06T00:00:00+00:00" },
];

async function importRoute() {
  return import("@/app/api/championships/journees/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  resetMockState();
});

describe("POST /api/championships/journees — authentification", () => {
  it("répond 401 si aucun utilisateur authentifié", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ championship_id: "champ-1", journees: VALID_JOURNEES }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/championships/journees — corps malformé", () => {
  it("répond 400 sur un corps JSON invalide (jamais 500)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());

    const { POST } = await importRoute();
    const res = await POST(makeRequest("{ pas du json"));
    expect(res.status).toBe(400);
  });

  it("répond 400 si championship_id est absent", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ journees: VALID_JOURNEES }));
    expect(res.status).toBe(400);
  });

  it("répond 400 si journees est absent du body", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ championship_id: "champ-1" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/championships/journees — autorisation coach", () => {
  it("répond 403 si l'utilisateur n'est pas coach de l'équipe", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(false);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ championship_id: "champ-1", journees: VALID_JOURNEES }));
    expect(res.status).toBe(403);
  });

  it("répond 403 si le championnat n'existe pas", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    mockState.championship = null;

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ championship_id: "champ-inconnu", journees: VALID_JOURNEES }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/championships/journees — payload invalide", () => {
  it("répond 400 sur une liste invalide (frontière pure, jamais mockée)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ championship_id: "champ-1", journees: [{ pas: "un numéro" }] }));
    expect(res.status).toBe(400);
    expect(lastUpdate).toBeNull();
  });
});

describe("POST /api/championships/journees — nominal", () => {
  it("200 : persiste la liste validée (triée par numéro) et la renvoie", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ championship_id: "champ-1", journees: VALID_JOURNEES }));
    expect(res.status).toBe(200);

    expect(lastUpdate).not.toBeNull();
    expect(lastUpdate!.journees).toEqual([
      { number: 1, name: "Journée 1", date: "2026-09-06T00:00:00+00:00" },
      { number: 3, name: "Journée 3", date: "2026-09-13T00:00:00+00:00" },
    ]);

    const payload = await res.json();
    expect(payload.journees).toHaveLength(2);
  });

  it("500 générique si l'UPDATE échoue, détail loggé côté serveur", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
    mockState.updateError = { message: "connexion perdue" };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { POST } = await importRoute();
    const res = await POST(makeRequest({ championship_id: "champ-1", journees: VALID_JOURNEES }));
    expect(res.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalled();

    const payload = await res.json();
    expect(JSON.stringify(payload)).not.toContain("connexion perdue");

    consoleSpy.mockRestore();
  });
});