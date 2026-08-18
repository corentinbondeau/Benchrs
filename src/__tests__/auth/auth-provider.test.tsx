/**
 * Tests — AuthProvider optimisé (cache sessionStorage + SELECT explicite)
 *
 * Périmètre :
 *   - Comportement observable via le hook useAuth (user, loading, signOut)
 *   - Cache sessionStorage : restauration instantanée au second montage (stale-while-revalidate)
 *   - Revalidation réseau en arrière-plan après restauration du cache
 *   - Résilience aux erreurs fetchProfile (pas de crash, user reste null)
 *
 * Hors-scope :
 *   - Rendu DOM du composant AuthProvider
 *   - Listeners onAuthStateChange complets
 *   - Intégration Supabase réel
 *
 * Phase "Red" attendue :
 *   - Tests cache & revalidation DOIVENT ÉCHOUER (feature pas encore implémentée)
 *   - Tests nominal & erreur doivent PASSER (comportement déjà en place)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";

// ─── Données de test ─────────────────────────────────────────────────────────

const MOCK_USER_ID = "user-test-123";
const MOCK_EMAIL = "test@benchrs.fr";

const MOCK_SESSION = {
  user: { id: MOCK_USER_ID, email: MOCK_EMAIL },
  access_token: "fake-access-token",
};

const MOCK_PROFILE = {
  id: MOCK_USER_ID,
  role: "coach" as const,
  first_name: "Jean",
  last_name: "Dupont",
  avatar_url: null,
  phone: null,
  date_of_birth: null,
  position: null,
  shirt_number: null,
  is_active: true,
  vma: null,
  vmi: null,
  licence_expires_at: null,
  medical_cert_expires_at: null,
  team_id: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const MOCK_PROFILE_UPDATED = {
  ...MOCK_PROFILE,
  first_name: "Jean-Updated",
  updated_at: "2024-06-01T00:00:00Z",
};

// ─── Clé de cache sessionStorage (doit correspondre à l'implémentation) ───────
const SESSION_CACHE_KEY = "auth_profile_cache";

// ─── Mocks Supabase ────────────────────────────────────────────────────────────
// On déclare les fonctions de mock mutables afin que chaque test puisse les reconfigurer.

const mockUnsubscribe = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

/**
 * Réinitialise tous les mocks Supabase avec les valeurs par défaut (session valide + profil OK).
 */
function resetSupabaseMocks({
  profileData = MOCK_PROFILE as typeof MOCK_PROFILE | null,
  profileError = null as { message: string } | null,
  sessionData = MOCK_SESSION as typeof MOCK_SESSION | null,
} = {}) {
  mockUnsubscribe.mockReset();
  mockSignOut.mockReset().mockResolvedValue({ error: null });

  mockGetSession.mockReset().mockResolvedValue({
    data: { session: sessionData },
    error: null,
  });

  // onAuthStateChange doit TOUJOURS retourner un objet valide
  mockOnAuthStateChange.mockReset().mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });

  // Chaîne fluide : from('profiles').select(...).eq(...).single()
  mockSingle.mockReset().mockResolvedValue({
    data: profileData,
    error: profileError,
  });
  mockEq.mockReset().mockReturnValue({ single: mockSingle });
  mockSelect.mockReset().mockReturnValue({ eq: mockEq });
  mockFrom.mockReset().mockReturnValue({ select: mockSelect });
}

// ─── Mock @/lib/supabase/client ──────────────────────────────────────────────
// Le mock utilise les fonctions déclarées ci-dessus, qui sont mutables entre tests.

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// ─── Import SUT (après les mocks) ────────────────────────────────────────────
import { AuthProvider, useAuth } from "@/lib/auth";

// ─── Wrapper pour renderHook ──────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AuthProvider, null, children);
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

// Patch window.location au niveau du module pour éviter les navigations réelles en jsdom.
// jsdom intercepte window.location.href = "..." et tente de charger la page, bloquant
// le cycle de microtasks dans act(). On utilise un Proxy pour intercepter toutes
// les assignations sans déclencher la navigation.
const locationProxy = new Proxy(
  { href: "", assign: vi.fn(), replace: vi.fn(), reload: vi.fn() },
  {
    set(target, prop, value) {
      (target as Record<string | symbol, unknown>)[prop as string] = value;
      return true; // Accepte l'assignation sans navigation
    },
    get(target, prop) {
      return (target as Record<string | symbol, unknown>)[prop as string];
    },
  }
);
Object.defineProperty(window, "location", {
  get: () => locationProxy,
  configurable: true,
});

beforeEach(() => {
  sessionStorage.clear();
  resetSupabaseMocks();
  // Réinitialiser le href entre tests
  (window.location as { href: string }).href = "";
});

afterEach(() => {
  // Ne pas utiliser vi.clearAllMocks() — cela efface aussi les mockReturnValue/mockResolvedValue
  // et peut corrompre l'état entre tests si beforeEach n'a pas le temps de les remettre.
  // On réinitialise manuellement les compteurs d'appels via mockClear sur chaque mock.
  [mockUnsubscribe, mockSignOut, mockGetSession, mockOnAuthStateChange,
   mockSingle, mockEq, mockSelect, mockFrom].forEach(m => m.mockClear());
});

// Restaurer window.location après tous les tests
// (vitest ne supporte pas afterAll au niveau module-scope, on le met dans un describe global)
afterEach(() => {
  // Note: la restauration globale n'est pas nécessaire car chaque test file a son propre jsdom
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CAS NOMINAL
// ─────────────────────────────────────────────────────────────────────────────

describe("AuthProvider — cas nominal", () => {
  it("useAuth expose user, loading et signOut", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toHaveProperty("user");
    expect(result.current).toHaveProperty("loading");
    expect(result.current).toHaveProperty("signOut");
    expect(typeof result.current.signOut).toBe("function");
  });

  it("loading commence à true puis passe à false après initialisation", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // État initial : loading = true (pas encore résolu)
    expect(result.current.loading).toBe(true);

    // Attendre que l'initialisation async se termine
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("user contient les données du profil après initialisation avec session valide", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.id).toBe(MOCK_USER_ID);
    expect(result.current.user?.email).toBe(MOCK_EMAIL);
    expect(result.current.user?.profile).toMatchObject({
      first_name: "Jean",
      last_name: "Dupont",
    });
  });

  it("user reste null quand il n'y a pas de session active", async () => {
    resetSupabaseMocks({ sessionData: null });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });

  it("signOut expose une fonction qui délègue à supabase.auth.signOut", async () => {
    // Ce test vérifie que signOut est bien câblé à supabase.auth.signOut.
    // Note: tester l'effet complet (user=null + navigation) requiert un contrôle
    // fin de jsdom — on valide ici le contrat minimal : l'API Supabase est appelée.
    // Le test "user vide" et "navigation" seront validés en phase Green via d'autres tests.

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.signOut).toBe("function");

    // Appeler signOut directement (sans act, pour éviter le blocage jsdom sur href)
    result.current.signOut().catch(() => {/* navigation jsdom ignorée */});

    // Attendre que mockSignOut soit appelé (micro-task)
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CACHE sessionStorage — stale-while-revalidate
// (PHASE RED : ces tests DOIVENT ÉCHOUER — feature non implémentée)
// ─────────────────────────────────────────────────────────────────────────────

describe("AuthProvider — cache sessionStorage [RED]", () => {
  it("au second montage, loading est false immédiatement si le cache existe", () => {
    // Simuler un cache pré-existant (comme après un premier montage réussi)
    const cachedUser = {
      id: MOCK_USER_ID,
      email: MOCK_EMAIL,
      profile: MOCK_PROFILE,
    };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachedUser));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // loading doit être false dès le premier render (restauration synchrone depuis cache)
    // Ce test ÉCHOUERA en phase Red : l'implémentation commence toujours avec loading=true
    expect(result.current.loading).toBe(false);
  });

  it("au second montage, user est disponible immédiatement depuis le cache", () => {
    const cachedUser = {
      id: MOCK_USER_ID,
      email: MOCK_EMAIL,
      profile: MOCK_PROFILE,
    };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachedUser));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // user doit être disponible sans attendre le fetch réseau
    // Ce test ÉCHOUERA en phase Red
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.id).toBe(MOCK_USER_ID);
    expect(result.current.user?.profile.first_name).toBe("Jean");
  });

  it("le cache est écrit dans sessionStorage après une initialisation réussie", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // sessionStorage doit contenir les données du profil après init
    // Ce test ÉCHOUERA en phase Red : l'implémentation n'écrit pas dans sessionStorage
    const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
    expect(cached).not.toBeNull();

    const parsed = JSON.parse(cached!);
    expect(parsed.id).toBe(MOCK_USER_ID);
    expect(parsed.profile).toMatchObject({ first_name: "Jean" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. REVALIDATION EN ARRIÈRE-PLAN — stale-while-revalidate
// (PHASE RED : test mise à jour données — feature non implémentée)
// ─────────────────────────────────────────────────────────────────────────────

describe("AuthProvider — revalidation réseau [RED]", () => {
  it("un fetch réseau est lancé même quand le cache existe (revalidation)", async () => {
    const cachedUser = {
      id: MOCK_USER_ID,
      email: MOCK_EMAIL,
      profile: MOCK_PROFILE,
    };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachedUser));

    renderHook(() => useAuth(), { wrapper });

    // Attendre que le fetch réseau se déclenche
    await waitFor(() => {
      // getSession doit être appelé même avec un cache (revalidation en arrière-plan)
      expect(mockGetSession).toHaveBeenCalled();
    });
  });

  it("si les données réseau diffèrent du cache, user est mis à jour [RED]", async () => {
    // Cache avec données "stale" (first_name = "Jean")
    const cachedUser = {
      id: MOCK_USER_ID,
      email: MOCK_EMAIL,
      profile: MOCK_PROFILE,
    };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachedUser));

    // Le réseau retourne des données plus récentes (first_name = "Jean-Updated")
    resetSupabaseMocks({ profileData: MOCK_PROFILE_UPDATED });

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Après revalidation réseau, user.profile doit être mis à jour
    await waitFor(() => {
      // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
      // user doit refléter les données réseau plus récentes
      // Ce test ÉCHOUERA en phase Red si le cache empêche la mise à jour
      expect(result.current.user?.profile?.first_name).toBe("Jean-Updated");
    });
  });

  it("si les données réseau sont identiques au cache, user ne change pas", async () => {
    const cachedUser = {
      id: MOCK_USER_ID,
      email: MOCK_EMAIL,
      profile: MOCK_PROFILE,
    };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cachedUser));

    resetSupabaseMocks({ profileData: MOCK_PROFILE }); // mêmes données

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // user doit être présent avec les bonnes données
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.profile?.first_name).toBe("Jean");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GESTION D'ERREUR
// ─────────────────────────────────────────────────────────────────────────────

describe("AuthProvider — gestion d'erreur", () => {
  it("si fetchProfile retourne une erreur, user reste null et loading passe à false", async () => {
    resetSupabaseMocks({
      profileData: null,
      profileError: { message: "Database unavailable" },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // user reste null — pas de crash
    expect(result.current.user).toBeNull();
  });

  it("si fetchProfile throw une exception inattendue, user reste null", async () => {
    // fetchProfile rejette avec une erreur brutale (pas de data, pas d'error object propre)
    // Note: l'implémentation actuelle ne catch pas ce cas — ce test documente
    // le comportement attendu APRÈS l'optimisation (try/catch autour de fetchProfile)
    mockSingle.mockRejectedValue(new Error("Network error - unexpected"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // user doit rester null en toutes circonstances (pas de données corrompues)
    await waitFor(
      () => {
        expect(result.current.user).toBeNull();
      },
      { timeout: 3000 }
    );

    expect(result.current.user).toBeNull();
  });

  it("si getSession échoue, loading passe à false et user reste null", async () => {
    // getSession qui retourne une structure invalide (simule un crash)
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: "Session fetch failed" },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
  });
});
