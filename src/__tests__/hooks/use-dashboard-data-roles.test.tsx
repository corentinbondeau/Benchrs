/**
 * Tests — useDashboardData (rôles Player et Parent)
 *
 * Périmètre :
 *   - Rôle player : retourne events, attendances, matchStats en un seul hook
 *   - Rôle parent : retourne children, events, convocations en un seul hook
 *   - Gestion d'erreur partielle : un fetch échoue, les autres marchent
 *
 * Hors-scope :
 *   - Rendu DOM des composants dashboard
 *   - Cache interne (queryCache) — testé séparément
 *   - Rôle coach (déjà couvert ou hors-périmètre US)
 *
 * Phase "Red" attendue :
 *   - Tous les tests DOIVENT ÉCHOUER — le hook useDashboardData
 *     n'existe pas encore (ou ne gère pas ces rôles)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";

// ─── Données de test ──────────────────────────────────────────────────────────

const MOCK_USER_ID = "player-user-001";
const MOCK_PARENT_USER_ID = "parent-user-002";
const MOCK_CHILD_ID = "child-user-003";
const MOCK_TEAM_ID = "team-test-001";

const MOCK_TEAM = {
  id: MOCK_TEAM_ID,
  name: "FC Test",
  club_id: "club-001",
  invite_code: "TEST123",
  color_primary: "#3B82F6",
  color_secondary: "#1E40AF",
  created_at: "2024-01-01T00:00:00Z",
};

const MOCK_EVENTS = [
  {
    id: "event-001",
    type: "training" as const,
    title: "Entraînement mardi",
    description: null,
    event_date: "2026-08-19T18:00:00Z",
    end_date: "2026-08-19T20:00:00Z",
    location: "Stade municipal",
    map_url: null,
    status: "upcoming" as const,
    opponent: null,
    match_result: null,
    score_us: null,
    score_them: null,
    sporteasy_id: null,
    created_by: null,
    team_id: MOCK_TEAM_ID,
    recurrence_group_id: null,
  },
  {
    id: "event-002",
    type: "match" as const,
    title: "Match samedi",
    description: null,
    event_date: "2026-08-22T15:00:00Z",
    end_date: null,
    location: "Terrain adverse",
    map_url: null,
    status: "upcoming" as const,
    opponent: "FC Rival",
    match_result: null,
    score_us: null,
    score_them: null,
    sporteasy_id: null,
    created_by: null,
    team_id: MOCK_TEAM_ID,
    recurrence_group_id: null,
  },
];

const MOCK_ATTENDANCES = [
  { id: "att-001", event_id: "event-001", user_id: MOCK_USER_ID, status: "present" as const, team_id: MOCK_TEAM_ID, minutes_played: 90, absence_reason: null, responded_at: "2026-08-19T17:50:00Z", created_at: "2026-08-01T00:00:00Z" },
  { id: "att-002", event_id: "event-002", user_id: MOCK_USER_ID, status: "pending" as const, team_id: MOCK_TEAM_ID, minutes_played: 0, absence_reason: null, responded_at: null, created_at: "2026-08-05T00:00:00Z" },
];

const MOCK_MATCH_STATS = [
  { id: "stat-001", event_id: "event-002", player_id: MOCK_USER_ID, goals: 2, assists: 1, yellow_cards: 0, red_cards: 0, clean_sheet: false, saves: 0, minutes_played: 90, team_id: MOCK_TEAM_ID, created_at: "2026-08-10T00:00:00Z" },
];

const MOCK_CHILD_PROFILE = {
  id: MOCK_CHILD_ID,
  role: "player" as const,
  first_name: "Lucas",
  last_name: "Parent",
  avatar_url: null,
  phone: null,
  date_of_birth: "2012-03-15",
  position: "attaquant",
  shirt_number: 9,
  is_active: true,
  vma: null,
  vmi: null,
  licence_expires_at: null,
  medical_cert_expires_at: null,
  team_id: MOCK_TEAM_ID,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_CHILD_CONVOCATIONS = [
  { id: "conv-001", event_id: "event-002", user_id: MOCK_CHILD_ID, status: "pending" as const, team_id: MOCK_TEAM_ID, minutes_played: 0, absence_reason: null, responded_at: null, created_at: "2026-08-05T00:00:00Z", event: MOCK_EVENTS[1] },
];

// ─── Mocks des modules ────────────────────────────────────────────────────────

// Fonctions Supabase mutables (reconfigurées dans chaque test)
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// useAuth : retourne un user player par défaut, reconfiguré par test si besoin
const mockUseAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  useAuth: () => mockUseAuth(),
}));

// useTeam : retourne une équipe par défaut
const mockUseTeam = vi.fn();
vi.mock("@/lib/team", () => ({
  useTeam: () => mockUseTeam(),
}));

// ─── Helpers de configuration des mocks ──────────────────────────────────────

/**
 * Configure les mocks Supabase pour le cas Player.
 * Simule les queries : events (trainings) → attendances → match_stats
 */
function setupPlayerMocks({
  eventsData = MOCK_EVENTS,
  attendancesData = MOCK_ATTENDANCES,
  matchStatsData = MOCK_MATCH_STATS,
  eventsError = null as { message: string } | null,
  attendancesError = null as { message: string } | null,
  matchStatsError = null as { message: string } | null,
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "events") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: eventsData[0], error: eventsError }),
                  }),
                }),
              }),
              // Pour le fetch "training events ids"
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: eventsData, error: eventsError }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "attendances") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: attendancesData, error: attendancesError }),
            }),
          }),
        }),
      };
    }
    if (table === "match_stats") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: matchStatsData, error: matchStatsError }),
          }),
        }),
      };
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
  });
}

/**
 * Configure les mocks Supabase pour le cas Parent.
 * Simule les queries : parent_student → profiles (child) → events → attendances → convocations
 */
function setupParentMocks({
  childData = MOCK_CHILD_PROFILE as typeof MOCK_CHILD_PROFILE | null,
  eventsData = MOCK_EVENTS,
  convocationsData = MOCK_CHILD_CONVOCATIONS,
  linkFound = true,
  childError = null as { message: string } | null,
  convocationsError = null as { message: string } | null,
} = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "parent_student") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: linkFound ? { student_id: MOCK_CHILD_ID } : null,
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: childData, error: childError }),
          }),
        }),
      };
    }
    if (table === "events") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: eventsData[0], error: null }),
                  }),
                }),
              }),
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: eventsData, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "attendances") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: convocationsData, error: convocationsError }),
              }),
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      };
    }
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
  });
}

// ─── Import SUT (après les mocks) ────────────────────────────────────────────
// Le hook n'existe pas encore → les tests DOIVENT ÉCHOUER en phase Red.
// On utilise un import dynamique conditionnel pour que Vitest puisse collecter
// et exécuter les tests individuellement plutôt que crasher au niveau du module.

type UseDashboardDataFn = (role: "player" | "parent") => {
  data: Record<string, unknown> | null;
  loading: boolean;
  error: { message: string } | null;
};

let useDashboardData: UseDashboardDataFn;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@/hooks/useDashboardData");
  useDashboardData = mod.useDashboardData;
} catch {
  // Hook absent : stub qui fait systématiquement échouer les assertions
  useDashboardData = (_role: "player" | "parent") => {
    throw new Error(
      "[RED] useDashboardData not found — hook does not exist yet. Create src/hooks/useDashboardData.ts"
    );
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useDashboardData — rôle player", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: MOCK_USER_ID,
        email: "player@benchrs.fr",
        profile: { role: "player", first_name: "Théo", last_name: "Martin" },
      },
    });
    mockUseTeam.mockReturnValue({
      currentTeam: MOCK_TEAM,
    });
    setupPlayerMocks();
  });

  it("[nominal] retourne events, attendances et matchStats pour un player", async () => {
    const { result } = renderHook(() => useDashboardData("player"));

    // Initialement en chargement
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Contrat API — les 3 clés doivent être présentes
    expect(result.current.data).not.toBeNull();
    expect(result.current.data).toHaveProperty("events");
    expect(result.current.data).toHaveProperty("attendances");
    expect(result.current.data).toHaveProperty("matchStats");
  });

  it("[nominal] les données retournées correspondent aux fixtures mockées", async () => {
    const { result } = renderHook(() => useDashboardData("player"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { data } = result.current;
    expect(data).not.toBeNull();

    // events — au moins un événement retourné
    expect(Array.isArray(data!.events)).toBe(true);
    expect(data!.events.length).toBeGreaterThan(0);

    // attendances — present/late comptabilisés
    expect(Array.isArray(data!.attendances)).toBe(true);

    // matchStats — goals et assists agrégés ou tableau brut
    expect(data!.matchStats).toBeDefined();
  });

  it("[nominal] pas d'erreur levée en conditions normales", async () => {
    const { result } = renderHook(() => useDashboardData("player"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
  });
});

describe("useDashboardData — rôle parent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: MOCK_PARENT_USER_ID,
        email: "parent@benchrs.fr",
        profile: { role: "parent", first_name: "Marie", last_name: "Martin" },
      },
    });
    mockUseTeam.mockReturnValue({
      currentTeam: MOCK_TEAM,
    });
    setupParentMocks();
  });

  it("[nominal] retourne children, events et convocations pour un parent", async () => {
    const { result } = renderHook(() => useDashboardData("parent"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Contrat API — les 3 clés doivent être présentes
    expect(result.current.data).not.toBeNull();
    expect(result.current.data).toHaveProperty("children");
    expect(result.current.data).toHaveProperty("events");
    expect(result.current.data).toHaveProperty("convocations");
  });

  it("[nominal] children contient le profil de l'enfant lié", async () => {
    const { result } = renderHook(() => useDashboardData("parent"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { data } = result.current;
    expect(data).not.toBeNull();

    // L'enfant doit être présent avec les bonnes données
    const children = data!.children;
    expect(Array.isArray(children) ? children.length : children).toBeTruthy();

    // Vérifie que le profil de l'enfant est bien celui mocké
    const child = Array.isArray(children) ? children[0] : children;
    expect(child).toMatchObject({
      id: MOCK_CHILD_ID,
      first_name: "Lucas",
    });
  });

  it("[nominal] convocations contient les convocations pending de l'enfant", async () => {
    const { result } = renderHook(() => useDashboardData("parent"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { data } = result.current;
    expect(data!.convocations).toBeDefined();
    expect(Array.isArray(data!.convocations)).toBe(true);
    expect(data!.convocations.length).toBeGreaterThan(0);
    expect(data!.convocations[0]).toMatchObject({ status: "pending" });
  });

  it("[nominal] cas sans enfant lié — retourne noChild indicator ou children vide", async () => {
    setupParentMocks({ linkFound: false, childData: null });

    const { result } = renderHook(() => useDashboardData("parent"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const { data } = result.current;
    expect(data).not.toBeNull();

    // Soit un flag noChild, soit un tableau vide
    const hasNoChildFlag = data!.noChild === true;
    const hasEmptyChildren = Array.isArray(data!.children) && data!.children.length === 0;
    const hasNullChildren = data!.children === null;

    expect(hasNoChildFlag || hasEmptyChildren || hasNullChildren).toBe(true);
  });
});

describe("useDashboardData — gestion d'erreur partielle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTeam.mockReturnValue({
      currentTeam: MOCK_TEAM,
    });
  });

  it("[erreur] player : matchStats en erreur — events et attendances retournés quand même", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: MOCK_USER_ID,
        email: "player@benchrs.fr",
        profile: { role: "player", first_name: "Théo", last_name: "Martin" },
      },
    });

    setupPlayerMocks({
      matchStatsError: { message: "DB timeout on match_stats" },
      matchStatsData: [],
    });

    const { result } = renderHook(() => useDashboardData("player"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Le hook ne doit pas crasher — il retourne les données disponibles
    expect(result.current.data).not.toBeNull();

    // events et attendances doivent être présents malgré l'erreur matchStats
    expect(result.current.data).toHaveProperty("events");
    expect(result.current.data).toHaveProperty("attendances");

    // matchStats peut être vide/null mais ne doit pas faire crasher le hook
    expect(result.current.data).toHaveProperty("matchStats");
  });

  it("[erreur] parent : convocations en erreur — children et events retournés quand même", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: MOCK_PARENT_USER_ID,
        email: "parent@benchrs.fr",
        profile: { role: "parent", first_name: "Marie", last_name: "Martin" },
      },
    });

    setupParentMocks({
      convocationsError: { message: "Network error on attendances" },
      convocationsData: [],
    });

    const { result } = renderHook(() => useDashboardData("parent"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Le hook ne doit pas crasher — données partielles gracieuses
    expect(result.current.data).not.toBeNull();
    expect(result.current.data).toHaveProperty("children");
    expect(result.current.data).toHaveProperty("events");

    // convocations peut être vide mais la clé doit exister
    expect(result.current.data).toHaveProperty("convocations");
  });

  it("[erreur] player : aucun currentTeam — retourne loading:false et data:null sans crash", async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: MOCK_USER_ID,
        email: "player@benchrs.fr",
        profile: { role: "player", first_name: "Théo", last_name: "Martin" },
      },
    });
    mockUseTeam.mockReturnValue({ currentTeam: null });

    const { result } = renderHook(() => useDashboardData("player"));

    // Sans team, le hook doit s'arrêter proprement (pas de fetch)
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
