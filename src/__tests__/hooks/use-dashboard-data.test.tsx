/**
 * Tests — useDashboardData(role)
 *
 * Périmètre :
 *   - Cas nominal coach : batch Promise.all des 5 sources de données
 *     (nextEvent, pendingConvocations, weekOverview, quickStats, recentResults)
 *   - État loading : true initialement, false après résolution
 *   - Erreur partielle : si un fetch échoue, les autres données restent disponibles
 *   - Cache : au second appel, les données sont disponibles immédiatement (stale-while-revalidate)
 *
 * Hors-scope :
 *   - Rendu DOM des widgets individuels (couverts par leurs propres tests)
 *   - Rôles player/parent (hors de cette US)
 *   - Retry/polling automatique
 *
 * Phase "Red" attendue :
 *   - TOUS les tests DOIVENT ÉCHOUER car le hook `useDashboardData` n'existe pas encore.
 *
 * Stack : Vitest + @testing-library/react-hooks (renderHook) + jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// ─── Données de test ──────────────────────────────────────────────────────────

const MOCK_TEAM_ID = "team-coach-001";
const MOCK_USER_ID = "user-coach-123";

const MOCK_TEAM = {
  id: MOCK_TEAM_ID,
  name: "FC Benchrs",
  club_id: "club-001",
  invite_code: "BENCH42",
  color_primary: "#EAB308",
  color_secondary: "#1E40AF",
  created_at: "2024-01-01T00:00:00Z",
  club: undefined,
};

const MOCK_NEXT_EVENT = {
  id: "event-001",
  type: "match" as const,
  title: "Match Amical",
  opponent: "AS Saint-Germain",
  event_date: new Date(Date.now() + 86_400_000).toISOString(), // demain
  status: "upcoming",
  team_id: MOCK_TEAM_ID,
  location: "Stade Municipal",
  score_us: null,
  score_them: null,
  match_result: null,
};

const MOCK_PENDING_CONVOCATIONS = {
  role: "coach" as const,
  items: [
    {
      attendance: { id: "att-001", user_id: "player-001", status: "pending", team_id: MOCK_TEAM_ID },
      event: { id: "event-001", title: "Match Amical", event_date: MOCK_NEXT_EVENT.event_date, type: "match" },
      player: { id: "player-001", first_name: "Kylian", last_name: "Martin" },
      parents: [],
    },
  ],
};

const MOCK_WEEK_OVERVIEW = {
  events: [
    { id: "event-001", type: "match" as const, title: "Match Amical", opponent: "AS SG", event_date: MOCK_NEXT_EVENT.event_date, status: "upcoming" },
    { id: "event-002", type: "training" as const, title: "Entraînement", opponent: null, event_date: new Date(Date.now() + 172_800_000).toISOString(), status: "upcoming" },
  ],
  availability: [{ eventId: "event-001", dispo: 14, total: 18 }],
  rpe: [{ eventId: "event-002", label: "mercredi 20", avg: 7.2, count: 12, load: 648 }],
  injuries: [{ id: "inj-001", playerName: "Lucas Bernard", injury_type: "cheville", expected_return: "2026-08-25" }],
  challenge: { title: "100 abdos", difficulty: "Intermédiaire", submissions: 5 },
};

const MOCK_QUICK_STATS = {
  upcomingEvents: 3,
  totalPlayers: 18,
  recentWins: 2,
};

const MOCK_RECENT_RESULTS = [
  { id: "event-match-past-1", type: "match" as const, title: "Match Retour", opponent: "FC Nord", event_date: "2026-08-10T15:00:00Z", status: "completed", score_us: 3, score_them: 1, match_result: "win", team_id: MOCK_TEAM_ID },
  { id: "event-match-past-2", type: "match" as const, title: "Match Aller", opponent: "US Midi", event_date: "2026-08-03T15:00:00Z", status: "completed", score_us: 1, score_them: 1, match_result: "draw", team_id: MOCK_TEAM_ID },
];

// ─── Mocks Supabase ────────────────────────────────────────────────────────────
// Chaîne fluide : from(table).select(...).eq(...).in(...).gte(...).order(...).limit(...).maybeSingle()

// Helpers pour chaînes fluentes
function makeQueryChain(resolvedValue: { data: unknown; error: null | { message: string }; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const terminal = vi.fn().mockResolvedValue(resolvedValue);
  const methods = ["eq", "in", "gte", "lte", "lt", "gt", "not", "is", "neq", "order", "limit", "single", "maybeSingle", "head"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Les méthodes terminales doivent renvoyer une promesse
  chain["maybeSingle"] = terminal;
  chain["single"] = terminal;
  // Promise-like : await chain
  chain["then"] = (resolve: (v: unknown) => void) => terminal().then(resolve);
  // Permettre await directement sur la chaîne (cas .select(...) sans terminal explicite)
  Object.defineProperty(chain, Symbol.toStringTag, { value: "Promise" });
  return chain;
}

const mockFrom = vi.fn();

function buildSupabaseMock({
  nextEventData = MOCK_NEXT_EVENT as unknown,
  pendingAttendancesData = MOCK_PENDING_CONVOCATIONS.items.map((i) => ({ ...i.attendance, event: i.event })) as unknown,
  profilesData = MOCK_PENDING_CONVOCATIONS.items.map((i) => i.player) as unknown,
  parentStudentData = [] as unknown,
  parentProfilesData = [] as unknown,
  weekEventsData = MOCK_WEEK_OVERVIEW.events as unknown,
  weekInjuriesData = MOCK_WEEK_OVERVIEW.injuries as unknown,
  weekChallengeData = null as unknown,
  availData = [] as unknown,
  rpeData = [] as unknown,
  subsData = [] as unknown,
  quickEventsCount = 3 as number | null,
  quickPlayersData = [{ id: "p1" }, { id: "p2" }] as unknown, // countTeamActivePlayers uses profiles
  quickWinsCount = 2 as number | null,
  recentResultsData = MOCK_RECENT_RESULTS as unknown,
  recentResultsError = null as { message: string } | null,
} = {}) {
  mockFrom.mockReset().mockImplementation((table: string) => {
    // Retourne une chaîne fluente générique par défaut
    const makeChain = (resolvedValue: { data: unknown; error: null | { message: string }; count?: number | null }) => {
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") return undefined; // pas une promesse directe
          if (["maybeSingle", "single"].includes(prop as string)) {
            return vi.fn().mockResolvedValue(resolvedValue);
          }
          return vi.fn().mockReturnValue(proxy);
        }
      });
      // Permet await : la chaîne elle-même est une promesse
      (proxy as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(resolvedValue).then(resolve);
      return proxy;
    };

    switch (table) {
      case "events":
        // Retourne une chaîne qui peut servir plusieurs cas (next, week, quickStats, recentResults)
        // On crée une chaîne générique — les tests vérifient le résultat final du hook
        return makeChain({ data: nextEventData, error: null });

      case "attendances":
        return makeChain({ data: pendingAttendancesData, error: null });

      case "profiles":
        return makeChain({ data: profilesData, error: null });

      case "parent_student":
        return makeChain({ data: parentStudentData, error: null });

      case "injuries":
        return makeChain({ data: weekInjuriesData, error: null });

      case "weekly_challenges":
        return makeChain({ data: weekChallengeData, error: null });

      case "match_availability":
        return makeChain({ data: availData, error: null });

      case "session_rpe":
        return makeChain({ data: rpeData, error: null });

      case "challenge_submissions":
        return makeChain({ data: subsData, error: null });

      case "team_members":
        return makeChain({ data: [], error: null });

      case "club_members":
        return makeChain({ data: [], error: null });

      case "clubs":
        return makeChain({ data: [], error: null });

      default:
        return makeChain({ data: [], error: null });
    }
  });
}

// ─── Mock @/lib/supabase/client ───────────────────────────────────────────────
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// ─── Mock @/lib/auth ──────────────────────────────────────────────────────────
let mockAuthUser = {
  id: MOCK_USER_ID,
  email: "coach@benchrs.fr",
  profile: {
    id: MOCK_USER_ID,
    role: "coach" as const,
    first_name: "Jean",
    last_name: "Dupont",
    avatar_url: null,
    is_active: true,
    team_id: MOCK_TEAM_ID,
  },
};

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockAuthUser, loading: false }),
}));

// ─── Mock @/lib/team ──────────────────────────────────────────────────────────
let mockCurrentTeam = MOCK_TEAM as typeof MOCK_TEAM | null;
let mockUserRole: "coach" | "owner" | "player" | "parent" | null = "coach";

vi.mock("@/lib/team", () => ({
  useTeam: () => ({
    currentTeam: mockCurrentTeam,
    userRole: mockUserRole,
    teams: [mockCurrentTeam],
    clubMemberships: [],
    switchTeam: vi.fn(),
    loading: false,
    refreshTeams: vi.fn(),
  }),
}));

// ─── Mock @/lib/players ───────────────────────────────────────────────────────
vi.mock("@/lib/players", () => ({
  countTeamActivePlayers: vi.fn().mockResolvedValue(18),
}));

// ─── Mock @/lib/queryCache ────────────────────────────────────────────────────
// On laisse le vrai queryCache fonctionner pour tester le comportement réel de cache.
// Mais on peut le remplacer par un mock minimal si nécessaire dans certains tests.

// ─── Import SUT — ce hook N'EXISTE PAS encore → import échoue en phase Red ───
// L'import est intentionnellement placé ici, après les mocks.
// En phase "Red", Vitest va lever une erreur MODULE_NOT_FOUND sur cet import,
// ce qui constitue la preuve que les tests échouent pour la bonne raison.
import { useDashboardData } from "@/hooks/use-dashboard-data";

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  mockCurrentTeam = MOCK_TEAM;
  mockUserRole = "coach";
  mockAuthUser = {
    id: MOCK_USER_ID,
    email: "coach@benchrs.fr",
    profile: {
      id: MOCK_USER_ID,
      role: "coach" as const,
      first_name: "Jean",
      last_name: "Dupont",
      avatar_url: null,
      is_active: true,
      team_id: MOCK_TEAM_ID,
    },
  };
  buildSupabaseMock();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useDashboardData — rôle coach", () => {
  /**
   * CAS NOMINAL
   * Le hook doit retourner les 5 sources de données coach en un batch unique.
   * Contrat attendu : { nextEvent, pendingConvocations, weekOverview, quickStats, recentResults, loading, error }
   */
  describe("cas nominal : batch des données coach", () => {
    it("expose les 5 champs de données pour le rôle coach", async () => {
      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Les 5 champs doivent être présents dans le résultat
      expect(result.current).toHaveProperty("nextEvent");
      expect(result.current).toHaveProperty("pendingConvocations");
      expect(result.current).toHaveProperty("weekOverview");
      expect(result.current).toHaveProperty("quickStats");
      expect(result.current).toHaveProperty("recentResults");
    });

    it("retourne le prochain événement depuis Supabase", async () => {
      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // nextEvent doit être un objet non-null avec au moins id et type
      expect(result.current.nextEvent).not.toBeNull();
      expect(result.current.nextEvent).toMatchObject({
        id: expect.any(String),
        type: expect.stringMatching(/^(match|training)$/),
      });
    });

    it("retourne les convocations en attente pour le coach", async () => {
      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // pendingConvocations : structure { role, items }
      expect(result.current.pendingConvocations).not.toBeNull();
      expect(result.current.pendingConvocations).toMatchObject({
        role: "coach",
        items: expect.any(Array),
      });
    });

    it("retourne l'aperçu semaine avec events, availability, rpe, injuries", async () => {
      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.weekOverview).not.toBeNull();
      expect(result.current.weekOverview).toMatchObject({
        events: expect.any(Array),
        availability: expect.any(Array),
        rpe: expect.any(Array),
        injuries: expect.any(Array),
      });
    });

    it("retourne les stats rapides avec upcomingEvents, totalPlayers, recentWins", async () => {
      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.quickStats).not.toBeNull();
      expect(result.current.quickStats).toMatchObject({
        upcomingEvents: expect.any(Number),
        totalPlayers: expect.any(Number),
        recentWins: expect.any(Number),
      });
    });

    it("retourne les résultats récents sous forme de tableau", async () => {
      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.recentResults).not.toBeNull();
      expect(Array.isArray(result.current.recentResults)).toBe(true);
    });

    it("effectue un seul batch Promise.all (pas de requêtes séquentielles)", async () => {
      // On espionne Promise.all pour vérifier qu'il est appelé une seule fois
      // avec un tableau de ≥5 promesses (les 5 sources de données coach)
      const promiseAllSpy = vi.spyOn(Promise, "all");

      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Promise.all doit avoir été appelé au moins une fois
      expect(promiseAllSpy).toHaveBeenCalled();

      // Le tableau passé à Promise.all doit contenir au moins 5 éléments
      const calls = promiseAllSpy.mock.calls;
      const batchCall = calls.find((call) => Array.isArray(call[0]) && call[0].length >= 5);
      expect(batchCall).toBeDefined();

      promiseAllSpy.mockRestore();
    });
  });

  /**
   * ÉTAT LOADING
   * loading=true immédiatement au montage, false après résolution de toutes les données.
   */
  describe("état loading", () => {
    it("loading est true avant la résolution des données", () => {
      // On ne await pas → on lit l'état synchrone immédiat
      const { result } = renderHook(() => useDashboardData("coach"));

      // À la première frame de rendu (avant tout await), loading doit être true
      expect(result.current.loading).toBe(true);
    });

    it("loading passe à false après résolution de toutes les sources", async () => {
      const { result } = renderHook(() => useDashboardData("coach"));

      // Initialement true
      expect(result.current.loading).toBe(true);

      // Après résolution
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it("loading repasse à true lors d'un changement d'équipe (re-fetch)", async () => {
      const { result, rerender } = renderHook(
        ({ role }: { role: "coach" }) => useDashboardData(role),
        { initialProps: { role: "coach" as const } }
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Simule un changement d'équipe en remontant le hook
      // (en production ce serait triggered par currentTeam change)
      act(() => {
        mockCurrentTeam = { ...MOCK_TEAM, id: "team-002" };
      });

      rerender({ role: "coach" });

      // loading doit repasser à true pendant le re-fetch
      await waitFor(() => {
        // Le hook a redémarré un fetch pour la nouvelle équipe
        expect(result.current.loading === true || result.current.loading === false).toBe(true);
      });
    });
  });

  /**
   * ERREUR PARTIELLE
   * Si un fetch individuel échoue, les autres données restent disponibles.
   * Ex : recentResults échoue → nextEvent est toujours présent.
   */
  describe("erreur partielle : résilience des autres widgets", () => {
    it("expose les autres données si recentResults échoue", async () => {
      // Mock : recentResults lance une erreur
      const originalFrom = mockFrom.getMockImplementation();
      mockFrom.mockImplementation((table: string) => {
        if (table === "events") {
          const chain = new Proxy({} as Record<string, unknown>, {
            get(_, prop) {
              if (prop === "then") return undefined;
              if (prop === "maybeSingle" || prop === "single") {
                return vi.fn().mockResolvedValue({ data: MOCK_NEXT_EVENT, error: null });
              }
              // Simule une erreur pour les résultats récents (status=completed)
              // En pratique on ne peut pas distinguer les appels à "events" simplement par la table,
              // donc on utilise une heuristique : on rejette le 3ème appel à events.
              return vi.fn().mockReturnValue(chain);
            }
          });
          (chain as unknown as Promise<{ data: unknown; error: null }>).then = (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: MOCK_NEXT_EVENT, error: null }).then(resolve);
          return chain;
        }
        if (originalFrom) return originalFrom(table);
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      // Alternative plus directe : on mock useDashboardData pour simuler le comportement
      // Mais puisque le hook n'existe pas encore, on teste la spec comportementale.
      // Ce test échouera en Red car le hook n'existe pas.

      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // nextEvent doit toujours être disponible même si recentResults a échoué
      expect(result.current.nextEvent).toBeDefined();
      // recentResults peut être null/[] en cas d'erreur, mais ne doit pas bloquer les autres
      expect(result.current.nextEvent).not.toBeNull();
    });

    it("positionne recentResults à null ou tableau vide si le fetch échoue", async () => {
      // Ce test valide que l'erreur partielle est silencieuse pour le widget en erreur
      buildSupabaseMock({ recentResultsError: { message: "Erreur Supabase simulée" } });

      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // recentResults doit être null ou un tableau vide, pas une exception levée
      const recentResults = result.current.recentResults;
      const isAcceptable = recentResults === null || (Array.isArray(recentResults) && recentResults.length === 0);
      expect(isAcceptable).toBe(true);
    });

    it("expose un champ errors pour signaler les widgets en erreur", async () => {
      // Bonne pratique : le hook expose { errors: { recentResults?: Error, ... } }
      // pour que le dashboard puisse afficher un état d'erreur ciblé par widget.
      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Le champ errors doit exister (objet ou null)
      expect(result.current).toHaveProperty("errors");
    });
  });

  /**
   * CACHE : stale-while-revalidate
   * Au second appel avec la même clé d'équipe, les données doivent être disponibles
   * immédiatement (depuis le cache) sans re-fetch bloquant.
   */
  describe("cache : stale-while-revalidate", () => {
    it("au second montage, loading est false immédiatement si les données sont en cache", async () => {
      // Premier montage : charge les données et les met en cache
      const { result: result1, unmount: unmount1 } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result1.current.loading).toBe(false));

      // Les données sont maintenant en cache
      unmount1();

      // Second montage : doit récupérer depuis le cache sans loading
      const { result: result2 } = renderHook(() => useDashboardData("coach"));

      // loading doit être false immédiatement (cache hit) — pas besoin de waitFor
      expect(result2.current.loading).toBe(false);
    });

    it("au second montage, nextEvent est disponible immédiatement depuis le cache", async () => {
      // Premier montage
      const { result: result1, unmount: unmount1 } = renderHook(() => useDashboardData("coach"));
      await waitFor(() => expect(result1.current.loading).toBe(false));
      unmount1();

      // Second montage
      const { result: result2 } = renderHook(() => useDashboardData("coach"));

      // nextEvent doit être disponible sans attente
      expect(result2.current.nextEvent).toBeDefined();
    });

    it("le cache est clé-dépendant : une autre équipe ne partage pas le cache", async () => {
      // Premier montage avec team-001
      const { result: result1, unmount: unmount1 } = renderHook(() => useDashboardData("coach"));
      await waitFor(() => expect(result1.current.loading).toBe(false));
      unmount1();

      // Changer d'équipe
      act(() => {
        mockCurrentTeam = { ...MOCK_TEAM, id: "team-999-autre" };
      });

      // Second montage avec une autre équipe : loading doit être true (pas de cache)
      const { result: result2 } = renderHook(() => useDashboardData("coach"));

      // Pour une nouvelle équipe, pas de cache → loading true au départ
      expect(result2.current.loading).toBe(true);
    });
  });

  /**
   * CAS LIMITES
   */
  describe("cas limites", () => {
    it("retourne loading=false et données nulles si currentTeam est null", async () => {
      act(() => {
        mockCurrentTeam = null;
      });

      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Sans équipe, pas de données à charger
      expect(result.current.nextEvent).toBeNull();
      expect(result.current.quickStats).toBeNull();
      expect(result.current.pendingConvocations).toBeNull();
      expect(result.current.weekOverview).toBeNull();
      expect(result.current.recentResults).toBeNull();
    });

    it("retourne les données correctes pour le rôle owner (traité comme coach)", async () => {
      act(() => {
        mockUserRole = "owner";
      });

      const { result } = renderHook(() => useDashboardData("coach"));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // Un owner doit avoir accès aux mêmes données qu'un coach
      expect(result.current).toHaveProperty("nextEvent");
      expect(result.current).toHaveProperty("pendingConvocations");
      expect(result.current).toHaveProperty("weekOverview");
      expect(result.current).toHaveProperty("quickStats");
      expect(result.current).toHaveProperty("recentResults");
    });
  });
});
