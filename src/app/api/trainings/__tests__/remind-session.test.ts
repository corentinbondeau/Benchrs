/**
 * Tests TDD — POST /api/trainings/[id]/remind-session (Phase RED)
 *
 * Route cible (non encore écrite) : permet à un coach de relancer
 * manuellement les joueurs qui n'ont pas rempli leur RPE et/ou leur
 * analyse de séance pour un entraînement donné.
 *
 * Conventions d'auth du repo (voir src/app/api/treasury/relance/route.ts) :
 *   - `getAuthUserDetailed(req)` → 401 si pas d'utilisateur
 *   - `isTeamCoach(user.id, teamId)` → 403 si non coach
 *   - `createAdminClient()` pour les accès DB
 *
 * Réponse attendue : { ok: true, reminded: N }
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock webpush (le vrai module appelle VAPID → erreur en env test)
// ---------------------------------------------------------------------------

vi.mock("@/lib/webpush", () => ({
  default: {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Mock api-auth
// ---------------------------------------------------------------------------

vi.mock("@/lib/api-auth", () => ({
  getAuthUserDetailed: vi.fn(),
  isTeamCoach: vi.fn(),
  unauthorized: (detail?: string) =>
    new Response(JSON.stringify({ error: "Non autorisé", ...(detail ? { detail } : {}) }), {
      status: 401,
    }),
  forbidden: () =>
    new Response(JSON.stringify({ error: "Accès refusé" }), { status: 403 }),
}));

// ---------------------------------------------------------------------------
// Mock supabase admin
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Module non-existant : les tests doivent échouer ici (RED)
import { POST } from "@/app/api/trainings/[id]/remind-session/route";

import { getAuthUserDetailed, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeUser(overrides: Partial<{ id: string }> = {}) {
  return {
    id: "coach-1",
    email: "coach@test.fr",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<{
  id: string;
  team_id: string;
  type: string;
  event_date: string;
}> = {}) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return {
    id: "event-1",
    team_id: "team-1",
    type: "training",
    event_date: yesterday,
    ...overrides,
  };
}

/** Construit une requête POST minimale pour la route */
function makeRequest() {
  return new Request("http://localhost/api/trainings/event-1/remind-session", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
  });
}

/** Construit un mock Supabase paramétrable pour la route */
function makeSupabase(opts: {
  event?: unknown;
  attendances?: unknown[];
  rpeRows?: unknown[];
  feedbackRows?: unknown[];
  parentLinks?: unknown[];
  teamSettings?: { team_id: string; rpe_reminders_enabled: boolean } | null;
  existingNotifications?: { reference_id: string }[];
  profiles?: { id: string }[];
}) {
  const {
    event = makeEvent(),
    attendances = [],
    rpeRows = [],
    feedbackRows = [],
    parentLinks = [],
    teamSettings = { team_id: "team-1", rpe_reminders_enabled: true },
    existingNotifications = [],
    // Par défaut : tous les joueurs présents/late sont considérés actifs,
    // pour ne pas affaiblir les tests existants qui ne stubent pas `profiles`.
    profiles = (attendances as { user_id: string }[]).map((a) => ({ id: a.user_id })),
  } = opts;

  const notificationsInsertMock = vi.fn().mockResolvedValue({ error: null });

  return {
    from: vi.fn((table: string) => {
      if (table === "events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: event, error: null }),
        };
      }
      if (table === "attendances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: attendances, error: null }),
        };
      }
      if (table === "session_rpe") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: rpeRows, error: null }),
        };
      }
      if (table === "session_feedback") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: feedbackRows, error: null }),
        };
      }
      if (table === "parent_student") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: parentLinks, error: null }),
        };
      }
      if (table === "team_settings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: teamSettings, error: null }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: profiles, error: null }),
        };
      }
      if (table === "notifications") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: existingNotifications, error: null }),
          insert: notificationsInsertMock,
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    _notificationsInsertMock: notificationsInsertMock,
  };
}

// ---------------------------------------------------------------------------
// Suite principale
// ---------------------------------------------------------------------------

describe("POST /api/trainings/[id]/remind-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // CAS 12 — AUTH : utilisateur non authentifié → 401
  // =========================================================================
  it("retourne 401 quand l'utilisateur n'est pas authentifié", async () => {
    vi.mocked(getAuthUserDetailed).mockResolvedValue({ user: null, reason: "token_manquant" });

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "event-1" }) });

    expect(res.status).toBe(401);
    expect(isTeamCoach).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CAS 13 — AUTH : authentifié mais non coach de l'équipe → 403
  // =========================================================================
  it("retourne 403 quand l'utilisateur authentifié n'est pas coach de l'équipe", async () => {
    vi.mocked(getAuthUserDetailed).mockResolvedValue({ user: makeUser() });
    vi.mocked(isTeamCoach).mockResolvedValue(false);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({}) as unknown as ReturnType<typeof createAdminClient>
    );

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "event-1" }) });

    expect(res.status).toBe(403);
  });

  // =========================================================================
  // CAS 14 — NOMINAL : coach → insère les notifications pour les manquants
  // =========================================================================
  it("insère les notifications des joueurs manquants et renvoie reminded=N", async () => {
    vi.mocked(getAuthUserDetailed).mockResolvedValue({ user: makeUser() });
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const supabase = makeSupabase({
      attendances: [{ user_id: "player-1", status: "present" }],
      rpeRows: [], // RPE manquant
      feedbackRows: [], // feedback manquant
    });
    vi.mocked(createAdminClient).mockReturnValue(
      supabase as unknown as ReturnType<typeof createAdminClient>
    );

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "event-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, reminded: 1 });
    expect(supabase._notificationsInsertMock).toHaveBeenCalled();
  });

  // =========================================================================
  // CAS 15 — LIMITE : aucun joueur manquant → reminded=0, aucune insertion
  // =========================================================================
  it("ne relance personne et ne fait aucune insertion quand tous les joueurs ont tout rempli", async () => {
    vi.mocked(getAuthUserDetailed).mockResolvedValue({ user: makeUser() });
    vi.mocked(isTeamCoach).mockResolvedValue(true);

    const supabase = makeSupabase({
      attendances: [{ user_id: "player-1", status: "present" }],
      rpeRows: [{ player_id: "player-1", rpe: 5 }],
      feedbackRows: [{ player_id: "player-1", rating: 4 }],
    });
    vi.mocked(createAdminClient).mockReturnValue(
      supabase as unknown as ReturnType<typeof createAdminClient>
    );

    const res = await POST(makeRequest(), { params: Promise.resolve({ id: "event-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, reminded: 0 });
    expect(supabase._notificationsInsertMock).not.toHaveBeenCalled();
  });
});
