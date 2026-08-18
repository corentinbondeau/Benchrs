/**
 * Tests — TeamProvider optimisé (cache localStorage + switchTeam léger)
 *
 * Périmètre :
 *   - Comportement observable via le hook useTeam (teams, currentTeam, switchTeam, loading)
 *   - Cache localStorage : restauration instantanée au second montage (stale-while-revalidate)
 *   - switchTeam léger : changement d'équipe sans rechargement réseau complet
 *   - Couleurs CSS : application des variables CSS au changement d'équipe
 *
 * Hors-scope :
 *   - Rendu DOM du composant TeamProvider
 *   - Gestion complète des club_memberships (comité/président)
 *   - Intégration Supabase réelle
 *
 * Phase "Red" attendue :
 *   - Tests cache localStorage & switchTeam léger DOIVENT ÉCHOUER (feature non implémentée)
 *   - Tests nominal & couleurs CSS doivent PASSER (comportement déjà en place)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// ─── Données de test ──────────────────────────────────────────────────────────

const MOCK_USER_ID = "user-team-test-456";

const MOCK_TEAM_1: MockTeam = {
  id: "team-001",
  name: "Équipe Alpha",
  club_id: "club-001",
  invite_code: "ALPHA123",
  color_primary: "#FF5733",
  color_secondary: "#33A1FF",
  created_at: "2024-01-01T00:00:00Z",
  club: null,
};

const MOCK_TEAM_2: MockTeam = {
  id: "team-002",
  name: "Équipe Beta",
  club_id: "club-001",
  invite_code: "BETA456",
  color_primary: "#22C55E",
  color_secondary: "#A855F7",
  created_at: "2024-02-01T00:00:00Z",
  club: null,
};

// Shape intermédiaire utilisé dans les mocks Supabase (avant mapping Team)
interface MockTeam {
  id: string;
  name: string;
  club_id: string;
  invite_code: string;
  color_primary: string;
  color_secondary: string;
  created_at: string;
  club: null | { id: string; name: string; logo_url: null; created_by: null; created_at: string }[];
}

// Réponse Supabase pour team_members
const MOCK_MEMBERSHIPS = [
  {
    team_id: MOCK_TEAM_1.id,
    role: "coach",
    team: {
      id: MOCK_TEAM_1.id,
      name: MOCK_TEAM_1.name,
      club_id: MOCK_TEAM_1.club_id,
      invite_code: MOCK_TEAM_1.invite_code,
      color_primary: MOCK_TEAM_1.color_primary,
      color_secondary: MOCK_TEAM_1.color_secondary,
      created_at: MOCK_TEAM_1.created_at,
      club: null,
    },
  },
  {
    team_id: MOCK_TEAM_2.id,
    role: "player",
    team: {
      id: MOCK_TEAM_2.id,
      name: MOCK_TEAM_2.name,
      club_id: MOCK_TEAM_2.club_id,
      invite_code: MOCK_TEAM_2.invite_code,
      color_primary: MOCK_TEAM_2.color_primary,
      color_secondary: MOCK_TEAM_2.color_secondary,
      created_at: MOCK_TEAM_2.created_at,
      club: null,
    },
  },
];

// ─── Clé de cache localStorage (doit correspondre à l'implémentation future) ──
const TEAM_CACHE_KEY = "team_cache";

// ─── Mocks Supabase ────────────────────────────────────────────────────────────

const mockTeamMembersEq = vi.fn();
const mockTeamMembersSelect = vi.fn();
const mockClubMembersEq = vi.fn();
const mockClubMembersSelect = vi.fn();
const mockClubsEq = vi.fn();
const mockClubsIn = vi.fn();
const mockClubsSelect = vi.fn();
const mockTeamsIn = vi.fn();
const mockTeamsSelect = vi.fn();
const mockFrom = vi.fn();

/**
 * Réinitialise les mocks Supabase avec les données par défaut.
 * Simule la chaîne fluide : from(table).select(...).eq(...)
 */
function resetSupabaseMocks({
  membershipsData = MOCK_MEMBERSHIPS as unknown[] | null,
  membershipsError = null as { message: string } | null,
} = {}) {
  // team_members : from("team_members").select(...).eq("user_id", userId)
  mockTeamMembersEq.mockReset().mockResolvedValue({
    data: membershipsData,
    error: membershipsError,
  });
  mockTeamMembersSelect.mockReset().mockReturnValue({ eq: mockTeamMembersEq });

  // club_members : from("club_members").select(...).eq("user_id", userId)
  mockClubMembersEq.mockReset().mockResolvedValue({ data: [], error: null });
  mockClubMembersSelect.mockReset().mockReturnValue({ eq: mockClubMembersEq });

  // clubs (created_by) : from("clubs").select("id").eq("created_by", userId)
  mockClubsEq.mockReset().mockResolvedValue({ data: [], error: null });
  mockClubsSelect.mockReset().mockReturnValue({ eq: mockClubsEq, in: mockClubsIn });

  // clubs (club_ids) : from("teams").select(...).in("club_id", clubIds)
  mockTeamsIn.mockReset().mockResolvedValue({ data: [], error: null });
  mockTeamsSelect.mockReset().mockReturnValue({ in: mockTeamsIn, eq: mockClubsEq });

  // Router from() selon le nom de table
  mockFrom.mockReset().mockImplementation((table: string) => {
    if (table === "team_members") return { select: mockTeamMembersSelect };
    if (table === "club_members") return { select: mockClubMembersSelect };
    if (table === "clubs") return { select: mockClubsSelect };
    if (table === "teams") return { select: mockTeamsSelect };
    return { select: vi.fn().mockReturnValue({ eq: vi.fn(), in: vi.fn() }) };
  });
}

// ─── Mock @/lib/supabase/client ───────────────────────────────────────────────

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// ─── Mock @/lib/auth ──────────────────────────────────────────────────────────
// useAuth() retourne un user connecté avec un team_id par défaut

vi.mock("@/lib/auth", () => ({
  useAuth: () => mockUseAuth(),
}));

let mockUseAuth = vi.fn(() => ({
  user: {
    id: MOCK_USER_ID,
    email: "coach@benchrs.fr",
    profile: { team_id: MOCK_TEAM_1.id },
  },
  loading: false,
}));

// ─── Import SUT (après les mocks) ─────────────────────────────────────────────
import { TeamProvider, useTeam } from "@/lib/team";

// ─── Wrapper renderHook ───────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(TeamProvider, null, children);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  // Réinitialiser les CSS custom properties (jsdom)
  document.documentElement.removeAttribute("style");
  resetSupabaseMocks();
  mockUseAuth = vi.fn(() => ({
    user: {
      id: MOCK_USER_ID,
      email: "coach@benchrs.fr",
      profile: { team_id: MOCK_TEAM_1.id },
    },
    loading: false,
  }));
});

afterEach(() => {
  [
    mockFrom, mockTeamMembersEq, mockTeamMembersSelect,
    mockClubMembersEq, mockClubMembersSelect,
    mockClubsEq, mockClubsIn, mockClubsSelect,
    mockTeamsIn, mockTeamsSelect,
  ].forEach((m) => m.mockClear());
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CAS NOMINAL
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamProvider — cas nominal", () => {
  it("useTeam expose teams, currentTeam, switchTeam et loading", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    expect(result.current).toHaveProperty("teams");
    expect(result.current).toHaveProperty("currentTeam");
    expect(result.current).toHaveProperty("switchTeam");
    expect(result.current).toHaveProperty("loading");
    expect(typeof result.current.switchTeam).toBe("function");
    expect(Array.isArray(result.current.teams)).toBe(true);
  });

  it("loading commence à true puis passe à false après chargement", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    // État initial : loading = true
    expect(result.current.loading).toBe(true);

    // Attendre la fin du chargement async
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("teams contient la liste des équipes après chargement", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.teams).toHaveLength(2);
    expect(result.current.teams.map((t) => t.id)).toContain(MOCK_TEAM_1.id);
    expect(result.current.teams.map((t) => t.id)).toContain(MOCK_TEAM_2.id);
  });

  it("currentTeam est l'équipe sélectionnée après chargement", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // currentTeam doit être une des équipes chargées
    expect(result.current.currentTeam).not.toBeNull();
    expect(result.current.currentTeam?.id).toBe(MOCK_TEAM_1.id);
  });

  it("teams est vide et currentTeam est null quand l'utilisateur n'est pas connecté", async () => {
    // Simuler l'absence de user
    mockUseAuth = vi.fn(() => ({ user: null, loading: false }));

    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.teams).toHaveLength(0);
    expect(result.current.currentTeam).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CACHE localStorage — stale-while-revalidate
// (PHASE RED : ces tests DOIVENT ÉCHOUER — feature non implémentée)
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamProvider — cache localStorage [RED]", () => {
  it("au second montage, loading est false immédiatement si le cache existe", () => {
    // Simuler un cache pré-existant (comme après un premier montage réussi)
    const cachedData = {
      teams: [MOCK_TEAM_1, MOCK_TEAM_2],
      currentTeamId: MOCK_TEAM_1.id,
      userId: MOCK_USER_ID,
    };
    localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(cachedData));

    const { result } = renderHook(() => useTeam(), { wrapper });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // loading doit être false dès le premier render (restauration synchrone depuis cache)
    // Ce test ÉCHOUERA en phase Red : l'implémentation commence toujours avec loading=true
    expect(result.current.loading).toBe(false);
  });

  it("au second montage, teams et currentTeam sont disponibles immédiatement depuis le cache", () => {
    const cachedData = {
      teams: [MOCK_TEAM_1, MOCK_TEAM_2],
      currentTeamId: MOCK_TEAM_1.id,
      userId: MOCK_USER_ID,
    };
    localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(cachedData));

    const { result } = renderHook(() => useTeam(), { wrapper });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // teams et currentTeam doivent être disponibles sans attendre le fetch réseau
    // Ce test ÉCHOUERA en phase Red
    expect(result.current.teams).toHaveLength(2);
    expect(result.current.currentTeam).not.toBeNull();
    expect(result.current.currentTeam?.id).toBe(MOCK_TEAM_1.id);
  });

  it("le cache localStorage est écrit après un premier chargement réussi", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // localStorage doit contenir les données des équipes après init
    // Ce test ÉCHOUERA en phase Red : l'implémentation n'écrit pas le cache teams
    const cached = localStorage.getItem(TEAM_CACHE_KEY);
    expect(cached).not.toBeNull();

    const parsed = JSON.parse(cached!);
    expect(parsed.teams).toHaveLength(2);
    expect(parsed.currentTeamId).toBe(MOCK_TEAM_1.id);
    expect(parsed.userId).toBe(MOCK_USER_ID);
  });

  it("le cache est invalidé si userId change (changement de compte)", () => {
    // Cache appartenant à un autre utilisateur
    const cachedData = {
      teams: [MOCK_TEAM_1],
      currentTeamId: MOCK_TEAM_1.id,
      userId: "autre-user-999",
    };
    localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(cachedData));

    const { result } = renderHook(() => useTeam(), { wrapper });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // Le cache d'un autre utilisateur ne doit pas être restauré → loading=true
    // Ce test ÉCHOUERA en phase Red pour la mauvaise raison (pas de cache du tout)
    // mais vérifie le comportement de sécurité attendu
    expect(result.current.loading).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. switchTeam LÉGER — sans rechargement réseau complet
// (PHASE RED : ces tests DOIVENT ÉCHOUER — feature non implémentée)
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamProvider — switchTeam léger [RED]", () => {
  it("switchTeam change currentTeam correctement", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // currentTeam est MOCK_TEAM_1 par défaut (premier de la liste)
    expect(result.current.currentTeam?.id).toBe(MOCK_TEAM_1.id);

    // Appeler switchTeam pour passer à MOCK_TEAM_2
    act(() => {
      result.current.switchTeam(MOCK_TEAM_2.id);
    });

    // currentTeam doit avoir changé
    expect(result.current.currentTeam?.id).toBe(MOCK_TEAM_2.id);
  });

  it("switchTeam ne déclenche PAS un reload réseau complet (loadTeams non rappelé)", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Compter les appels réseau après le premier chargement
    const callsBefore = mockTeamMembersEq.mock.calls.length;

    // Appeler switchTeam
    act(() => {
      result.current.switchTeam(MOCK_TEAM_2.id);
    });

    // Attendre un tick pour s'assurer qu'aucune requête asynchrone ne part
    await new Promise((resolve) => setTimeout(resolve, 50));

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // Aucune nouvelle requête Supabase ne doit être lancée
    // Ce test ÉCHOUERA en phase Red : l'implémentation actuelle rappelle loadTeams()
    const callsAfter = mockTeamMembersEq.mock.calls.length;
    expect(callsAfter).toBe(callsBefore);
  });

  it("switchTeam met à jour localStorage.selectedTeamId correctement", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.switchTeam(MOCK_TEAM_2.id);
    });

    // localStorage.selectedTeamId doit refléter le nouveau choix
    expect(localStorage.getItem("selectedTeamId")).toBe(MOCK_TEAM_2.id);
  });

  it("switchTeam vers une équipe inexistante ne change pas currentTeam", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const teamAvant = result.current.currentTeam?.id;

    act(() => {
      result.current.switchTeam("team-inexistante-999");
    });

    // currentTeam ne doit pas changer si l'ID n'existe pas dans teams
    expect(result.current.currentTeam?.id).toBe(teamAvant);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. COULEURS CSS
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamProvider — couleurs CSS", () => {
  it("les couleurs CSS de l'équipe sont appliquées après chargement initial", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const rootStyle = document.documentElement.style;

    // Les variables CSS de MOCK_TEAM_1 doivent être appliquées
    expect(rootStyle.getPropertyValue("--color-gold")).toBe(MOCK_TEAM_1.color_primary);
    expect(rootStyle.getPropertyValue("--color-royal")).toBe(MOCK_TEAM_1.color_secondary);
  });

  it("les couleurs CSS sont mises à jour lors d'un switchTeam", async () => {
    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Passer à MOCK_TEAM_2
    act(() => {
      result.current.switchTeam(MOCK_TEAM_2.id);
    });

    const rootStyle = document.documentElement.style;

    // Les variables CSS de MOCK_TEAM_2 doivent maintenant être appliquées
    expect(rootStyle.getPropertyValue("--color-gold")).toBe(MOCK_TEAM_2.color_primary);
    expect(rootStyle.getPropertyValue("--color-royal")).toBe(MOCK_TEAM_2.color_secondary);
  });

  it("les couleurs CSS sont réinitialisées si aucune équipe n'est trouvée", async () => {
    // Simuler un user sans équipes
    resetSupabaseMocks({ membershipsData: [] });

    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const rootStyle = document.documentElement.style;

    // Les couleurs par défaut doivent être appliquées
    expect(rootStyle.getPropertyValue("--color-gold")).toBe("#EAB308");
    expect(rootStyle.getPropertyValue("--color-royal")).toBe("#1E40AF");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. GESTION D'ERREUR
// ─────────────────────────────────────────────────────────────────────────────

describe("TeamProvider — gestion d'erreur", () => {
  it("si la requête team_members échoue, teams est vide et loading passe à false", async () => {
    resetSupabaseMocks({
      membershipsData: null,
      membershipsError: { message: "Database unavailable" },
    });

    const { result } = renderHook(() => useTeam(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.teams).toHaveLength(0);
    expect(result.current.currentTeam).toBeNull();
  });
});
