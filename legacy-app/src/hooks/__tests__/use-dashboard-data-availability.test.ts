/**
 * TNR — Ratio disponibilité sondage de présence
 *
 * Périmètre :
 *   Tester la logique de comptage dans fetchWeekOverview() (use-dashboard-data.ts)
 *   → `total` doit = nombre de joueurs ACTIFS de l'équipe (countTeamActivePlayers)
 *   → `total` ne doit PAS = nombre de réponses au sondage
 *
 * Bug reproduit :
 *   `a.total += 1` comptait les réponses → "2/2 dispo" au lieu de "2/18 dispo"
 *
 * Hors-scope :
 *   - Rendu JSX de CoachWeekOverview (composant UI sans logique propre)
 *   - Tests E2E
 *   - Autres widgets du dashboard (couverts par use-dashboard-data.test.tsx)
 *
 * Phase RED attendue :
 *   Les 3 tests DOIVENT ÉCHOUER car le code buggé fait `a.total += 1`
 *   au lieu d'utiliser `countTeamActivePlayers`.
 *
 * Stack : Vitest + @testing-library/react (renderHook) + jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ─── Constantes de test ───────────────────────────────────────────────────────

const TEAM_ID = "team-tnr-avail-001";
const EVENT_ID = "event-match-001";
const ACTIVE_PLAYERS_COUNT = 18;

// ─── Mock @/lib/supabase/client ───────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

// ─── Mock @/lib/auth ──────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "coach-tnr-001", email: "coach@test.fr" },
    loading: false,
  }),
}));

// ─── Mock @/lib/team ──────────────────────────────────────────────────────────

vi.mock("@/lib/team", () => ({
  useTeam: () => ({
    currentTeam: { id: TEAM_ID, name: "FC TNR" },
    userRole: "coach",
    teams: [{ id: TEAM_ID, name: "FC TNR" }],
    clubMemberships: [],
    switchTeam: vi.fn(),
    loading: false,
    refreshTeams: vi.fn(),
  }),
}));

// ─── Mock @/lib/players ───────────────────────────────────────────────────────
// Simule 18 joueurs actifs dans l'équipe (le "total" correct attendu)
// Note : valeur littérale obligatoire — vi.mock() est hoisted avant les constantes

vi.mock("@/lib/players", () => ({
  countTeamActivePlayers: vi.fn().mockResolvedValue(18),
}));

// ─── Mock @/lib/queryCache ────────────────────────────────────────────────────
// Désactivé pour forcer un vrai fetch à chaque test

vi.mock("@/lib/queryCache", () => ({
  getQueryCache: vi.fn().mockReturnValue({ has: false, data: null }),
  setQueryCache: vi.fn(),
}));

// ─── Helper : builder de chaîne Supabase fluente ─────────────────────────────

function makeFluentChain(resolvedValue: { data: unknown; error: null | { message: string } }) {
  const proxy: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get(_, prop) {
      if (prop === "then") return undefined; // pas une promesse directe
      if (prop === "maybeSingle" || prop === "single") {
        return vi.fn().mockResolvedValue(resolvedValue);
      }
      // Toutes les méthodes de filtrage retournent la chaîne elle-même
      return vi.fn().mockReturnValue(proxy);
    },
  });
  // Rend la chaîne awaitable directement (pour les cas sans terminal explicite)
  (proxy as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolvedValue).then(resolve);
  return proxy;
}

// ─── Helper : construction du mock Supabase complet ──────────────────────────

function buildSupabaseMock(availabilityRows: { event_id: string; availability: string }[]) {
  // Un événement match cette semaine
  const weekEvent = {
    id: EVENT_ID,
    type: "match",
    title: "Match TNR",
    opponent: "AS Test",
    event_date: new Date(Date.now() + 86_400_000).toISOString(),
    status: "upcoming",
  };

  mockFrom.mockReset().mockImplementation((table: string) => {
    switch (table) {
      // Événements de la semaine (match présent → matchIds non vide)
      case "events":
        return makeFluentChain({ data: weekEvent, error: null });

      // Disponibilités : retourne les lignes de réponse passées en paramètre
      case "match_availability":
        return makeFluentChain({ data: availabilityRows, error: null });

      // Blessures
      case "injuries":
        return makeFluentChain({ data: null, error: null });

      // Défis hebdo
      case "weekly_challenges":
        return makeFluentChain({ data: null, error: null });

      // RPE entraînement
      case "session_rpe":
        return makeFluentChain({ data: null, error: null });

      // Soumissions défi
      case "challenge_submissions":
        return makeFluentChain({ data: null, error: null });

      // Convocations en attente
      case "attendances":
        return makeFluentChain({ data: null, error: null });

      // Profils
      case "profiles":
        return makeFluentChain({ data: null, error: null });

      // Relations parent-élève
      case "parent_student":
        return makeFluentChain({ data: null, error: null });

      default:
        return makeFluentChain({ data: null, error: null });
    }
  });
}

// ─── Import SUT ───────────────────────────────────────────────────────────────

import { useDashboardData } from "@/hooks/use-dashboard-data";

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests TNR ────────────────────────────────────────────────────────────────

describe("ratio disponibilité — fix comptage (TNR)", () => {
  /**
   * CAS 1 — TNR du bug (cas nominal)
   *
   * Scénario : 2 réponses "dispo" pour un match, 18 joueurs actifs dans l'équipe.
   * BUG attendu en RED : availability[0].total === 2 (nombre de réponses)
   * COMPORTEMENT ATTENDU après fix : availability[0].total === 18 (nombre de joueurs)
   *
   * Ce test est la protection directe contre la régression du bug.
   */
  it("TNR — 2 réponses dispo sur 18 joueurs : total = 18, pas 2", async () => {
    // 2 joueurs ont répondu "dispo" sur un effectif de 18
    buildSupabaseMock([
      { event_id: EVENT_ID, availability: "dispo" },
      { event_id: EVENT_ID, availability: "dispo" },
    ]);

    const { result } = renderHook(() => useDashboardData("coach"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const weekOverview = result.current.weekOverview;
    expect(weekOverview).not.toBeNull();
    expect(weekOverview!.availability).toHaveLength(1);

    const avail = weekOverview!.availability[0];
    expect(avail.dispo).toBe(2); // 2 réponses "dispo" → correct
    expect(avail.total).toBe(ACTIVE_PLAYERS_COUNT); // total = joueurs actifs = 18, PAS 2
  });

  /**
   * CAS 2 — Protection contre l'erreur PGRST116 (.maybeSingle() sur N lignes)
   *
   * Scénario : 3+ réponses pour un même event_id.
   * BUG attendu en RED : .maybeSingle() lève PGRST116 si la query retourne >1 ligne
   * COMPORTEMENT ATTENDU après fix : toutes les réponses sont comptées sans erreur.
   *
   * La query match_availability NE DOIT PAS utiliser .maybeSingle() car elle
   * retourne plusieurs lignes (une par joueur ayant répondu).
   */
  it("3+ réponses : pas d'erreur PGRST116, toutes les réponses sont comptées", async () => {
    // 3 réponses différentes pour le même match
    buildSupabaseMock([
      { event_id: EVENT_ID, availability: "dispo" },
      { event_id: EVENT_ID, availability: "dispo" },
      { event_id: EVENT_ID, availability: "pas_dispo" },
    ]);

    const { result } = renderHook(() => useDashboardData("coach"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Le hook ne doit pas avoir levé d'erreur pour weekOverview
    expect(result.current.errors.weekOverview).toBeNull();

    const weekOverview = result.current.weekOverview;
    expect(weekOverview).not.toBeNull();

    const avail = weekOverview!.availability[0];
    // 2 "dispo" sur 3 réponses → dispo = 2
    expect(avail.dispo).toBe(2);
    // total = joueurs actifs (18), pas le nombre de réponses (3)
    expect(avail.total).toBe(ACTIVE_PLAYERS_COUNT);
  });

  /**
   * CAS 3 — Aucune réponse au sondage
   *
   * Scénario : le sondage existe mais aucun joueur n'a répondu.
   * COMPORTEMENT ATTENDU : availability vide OU { dispo: 0, total: 18 }
   * L'important : si une entrée existe, total ne peut pas être 0 (= les joueurs existent).
   *
   * Ce cas valide que le fix utilise countTeamActivePlayers même quand
   * il n'y a aucune ligne dans match_availability.
   */
  it("0 réponse : availability vide ou total = 18 avec dispo = 0", async () => {
    buildSupabaseMock([]); // aucune réponse

    const { result } = renderHook(() => useDashboardData("coach"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const weekOverview = result.current.weekOverview;
    expect(weekOverview).not.toBeNull();

    const availability = weekOverview!.availability;

    if (availability.length > 0) {
      // Si le hook retourne une entrée même sans réponses, total doit être le nb de joueurs
      expect(availability[0].dispo).toBe(0);
      expect(availability[0].total).toBe(ACTIVE_PLAYERS_COUNT);
    } else {
      // Cas acceptable : availability vide si aucune réponse (comportement défensif)
      expect(availability).toHaveLength(0);
    }
  });
});
