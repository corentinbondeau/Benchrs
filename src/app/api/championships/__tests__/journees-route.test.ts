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
  championship: {
    id: string;
    team_id: string;
    dofa_cp_no: number | null;
    dofa_phase: number | null;
    dofa_poule: number | null;
  } | null;
  updateError: { message: string } | null;
  standingsRows: Array<{ dofa_ma_no: number }>;
  standingsReadError: { message: string } | null;
  upsertError: { message: string } | null;
}

let mockState: JourneesMockState;
let lastUpdate: Record<string, unknown> | null;
let lastUpsertRows: Array<Record<string, unknown>> | null;
let lastUpsertOptions: Record<string, unknown> | null;

function resetMockState() {
  mockState = {
    championship: { id: "champ-1", team_id: "team-1", dofa_cp_no: 457592, dofa_phase: 1, dofa_poule: 1 },
    updateError: null,
    standingsRows: [],
    standingsReadError: null,
    upsertError: null,
  };
  lastUpdate = null;
  lastUpsertRows = null;
  lastUpsertOptions = null;
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
      if (table === "championship_standings") {
        return {
          select: () => ({
            eq: () => ({
              data: mockState.standingsReadError ? null : mockState.standingsRows,
              error: mockState.standingsReadError,
            }),
          }),
          upsert: (rows: Array<Record<string, unknown>>, options: Record<string, unknown>) => {
            lastUpsertRows = rows;
            lastUpsertOptions = options;
            return {
              error: mockState.upsertError,
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

// ─── Matchs embarqués dans les journées ───────────────────────────────────────

function embeddedMatch(maNo: number): Record<string, unknown> {
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

function journee(number: number, matches: unknown[], cpNo = 457592): Record<string, unknown> {
  return {
    number,
    name: `Journée ${number}`,
    _date: "2026-09-19T00:00:00+00:00",
    competition: { cp_no: cpNo, name: "U14 D1", level: "D" },
    phase: { number: 1, type: "CH", name: "PHASE 1" },
    poule: { stage_number: 1, name: "POULE A", gp_diff_no_tour: 0 },
    matchs: matches,
  };
}

describe("POST /api/championships/journees — matchs embarqués", () => {
  it("200 : étiquettes persistées + matchs de toutes les journées upsertés (imported/updated)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
    mockState.standingsRows = [{ dofa_ma_no: 101 }];

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        championship_id: "champ-1",
        journees: [journee(1, [embeddedMatch(101), embeddedMatch(102)]), journee(2, [])],
      })
    );
    expect(res.status).toBe(200);

    expect(lastUpdate).not.toBeNull();
    expect(lastUpdate!.journees).toHaveLength(2);

    expect(lastUpsertRows).not.toBeNull();
    expect(lastUpsertRows).toHaveLength(2);
    expect(lastUpsertOptions).toEqual({ onConflict: "championship_id,dofa_ma_no" });
    const byMa = new Map((lastUpsertRows ?? []).map((row) => [row.dofa_ma_no, row]));
    expect(byMa.get(101)).toMatchObject({
      championship_id: "champ-1",
      home_team: "ECC 1",
      away_team: "OL 1",
      home_score: 2,
      away_score: 1,
      matchday_number: 1,
      source: "dofa_import",
    });
    expect(byMa.get(102)).toEqual(expect.objectContaining({ home_team: "ECC 1" }));

    const payload = await res.json();
    expect(payload.imported).toBe(1);
    expect(payload.updated).toBe(1);
  });

  it("400 si le triplet déclaré des journées ne correspond pas au championnat (ancre anti-injection)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        championship_id: "champ-1",
        journees: [journee(1, [embeddedMatch(101)], 999999)],
      })
    );
    expect(res.status).toBe(400);
    expect(lastUpdate).toBeNull();
    expect(lastUpsertRows).toBeNull();
  });

  it("500 générique si la lecture OU l'upsert des matchs échoue, détail jamais divulgué", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
    mockState.upsertError = { message: "contrainte unique violée" };
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        championship_id: "champ-1",
        journees: [journee(1, [embeddedMatch(101)])],
      })
    );
    expect(res.status).toBe(500);

    const payload = await res.json();
    expect(JSON.stringify(payload)).not.toContain("contrainte unique violée");
    consoleSpy.mockRestore();
  });

  it("étiquetage seul (sans matchs embarqués) : aucun appel standings, compteurs 0", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamCoach).mockResolvedValue(true);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        championship_id: "champ-1",
        journees: [
          { number: 2, name: "Journée 2", _date: "2026-09-26T00:00:00+00:00" },
          { number: 1, name: "Journée 1", _date: "2026-09-19T00:00:00+00:00" },
        ],
      })
    );
    expect(res.status).toBe(200);
    expect(lastUpsertRows).toBeNull();

    const payload = await res.json();
    expect(payload.imported).toBe(0);
    expect(payload.updated).toBe(0);
    expect(payload.journees).toHaveLength(2);
    consoleSpy.mockRestore();
  });
});