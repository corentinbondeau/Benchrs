/**
 * Tests TDD — computeMissingResponders / sendSessionReminders (Phase RED)
 *
 * Feature cible : relancer les joueurs qui n'ont pas rempli leur RPE
 * et/ou leur analyse de séance (feedback), pour un entraînement passé.
 * Relance combinée : un joueur est "manquant" s'il lui manque l'un OU l'autre.
 *
 * Règles métier :
 *   - Joueurs attendus = lignes `attendances` avec status IN ('present','late').
 *   - RPE rempli = ligne `session_rpe` (event_id, player_id) avec `rpe IS NOT NULL`.
 *     Une ligne avec `rpe: null` (check-in de forme seul) compte comme manquante.
 *   - Analyse remplie = ligne `session_feedback` (event_id, player_id) avec
 *     `rating IS NOT NULL`.
 *   - Seuls les `events.type = 'training'` passés sont concernés.
 *   - Les parents liés (`parent_student.parent_id` pour student_id = joueur,
 *     même team_id) reçoivent aussi la notification.
 *   - Dédup : `reference_id = seance-relance:${eventId}:${userId}` (userId =
 *     destinataire réel, joueur OU parent) sur `notifications.type = 'relance_seance'`.
 *   - Notification : type 'relance_seance', url `/trainings/${eventId}`,
 *     team_id, scheduled_for = now, delivered_at non renseigné.
 *   - Opt-out équipe : `team_settings.rpe_reminders_enabled = false` → pas de relance.
 *
 * Schéma DB simulé :
 *   - `events` : id, team_id, type, event_date
 *   - `attendances` : event_id, user_id, status
 *   - `session_rpe` : event_id, player_id, rpe
 *   - `session_feedback` : event_id, player_id, rating
 *   - `parent_student` : parent_id, student_id, team_id
 *   - `team_settings` : team_id, rpe_reminders_enabled
 *   - `notifications` : user_id, team_id, type, reference_id, url, scheduled_for, delivered_at
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Module non-existant : les tests doivent échouer ici (RED)
import {
  computeMissingResponders,
  sendSessionReminders,
} from "@/lib/session-reminders";

// ---------------------------------------------------------------------------
// Mock webpush (le vrai module appelle VAPID → erreur en env test)
// ---------------------------------------------------------------------------

vi.mock("@/lib/webpush", () => ({
  default: {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAttendance(overrides: Partial<{ user_id: string; status: string | null }> = {}) {
  return { user_id: "player-1", status: "present", ...overrides };
}

function makeRpeRow(overrides: Partial<{ player_id: string; rpe: number | null }> = {}) {
  return { player_id: "player-1", rpe: 5, ...overrides };
}

function makeFeedbackRow(
  overrides: Partial<{ player_id: string; rating: number | null }> = {}
) {
  return { player_id: "player-1", rating: 4, ...overrides };
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
    event_date: yesterday, // passé
    ...overrides,
  };
}

/**
 * Construit un mock Supabase pour `sendSessionReminders`, avec des tables
 * paramétrables. Pattern B : builders chaînés (`mockReturnThis`) qui se
 * terminent par un `mockResolvedValue`/`mockReturnValue` selon la table.
 */
function makeSupabase(opts: {
  events?: unknown[];
  attendances?: unknown[];
  rpeRows?: unknown[];
  feedbackRows?: unknown[];
  parentLinks?: unknown[];
  teamSettings?: { team_id: string; rpe_reminders_enabled: boolean }[];
  existingNotifications?: { reference_id: string }[];
  profiles?: { id: string }[];
}) {
  const {
    events = [makeEvent()],
    attendances = [],
    rpeRows = [],
    feedbackRows = [],
    parentLinks = [],
    teamSettings = [],
    existingNotifications = [],
    // Par défaut : tous les joueurs présents/late sont considérés actifs,
    // pour ne pas affaiblir les tests existants qui ne stubent pas `profiles`.
    profiles = (attendances as { user_id: string }[]).map((a) => ({ id: a.user_id })),
  } = opts;

  const notificationsInsertMock = vi.fn().mockResolvedValue({ error: null });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({ data: events, error: null }),
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
          in: vi.fn().mockResolvedValue({ data: teamSettings, error: null }),
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

  return supabase as unknown as SupabaseClient & {
    _notificationsInsertMock: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Suite : computeMissingResponders (logique pure — priorité)
// ---------------------------------------------------------------------------

describe("computeMissingResponders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // CAS 1 — NOMINAL : 3 présents, 1 a tout rempli → 2 manquants
  // =========================================================================
  it("retourne les joueurs manquants avec les bons flags quand certains ont tout rempli", () => {
    const result = computeMissingResponders({
      attendances: [
        makeAttendance({ user_id: "player-1", status: "present" }),
        makeAttendance({ user_id: "player-2", status: "present" }),
        makeAttendance({ user_id: "player-3", status: "present" }),
      ],
      rpeRows: [makeRpeRow({ player_id: "player-1", rpe: 6 })],
      feedbackRows: [makeFeedbackRow({ player_id: "player-1", rating: 3 })],
      activePlayerIds: ["player-1", "player-2", "player-3"],
    });

    expect(result).toHaveLength(2);
    const byId = Object.fromEntries(result.map((r) => [r.userId, r]));
    expect(byId["player-2"]).toEqual({
      userId: "player-2",
      missingRpe: true,
      missingFeedback: true,
    });
    expect(byId["player-3"]).toEqual({
      userId: "player-3",
      missingRpe: true,
      missingFeedback: true,
    });
    expect(byId["player-1"]).toBeUndefined();
  });

  // =========================================================================
  // CAS 2 — ERREUR MÉTIER : session_rpe.rpe = null (check-in de forme seul)
  // → considéré manquant malgré l'existence de la ligne
  // =========================================================================
  it("considère le RPE manquant quand la ligne session_rpe existe avec rpe=null", () => {
    const result = computeMissingResponders({
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [makeRpeRow({ player_id: "player-1", rpe: null })],
      feedbackRows: [makeFeedbackRow({ player_id: "player-1", rating: 4 })],
      activePlayerIds: ["player-1"],
    });

    expect(result).toEqual([
      { userId: "player-1", missingRpe: true, missingFeedback: false },
    ]);
  });

  // =========================================================================
  // CAS 3 — ERREUR MÉTIER : session_feedback.rating = null → analyse manquante
  // =========================================================================
  it("considère l'analyse manquante quand la ligne session_feedback existe avec rating=null", () => {
    const result = computeMissingResponders({
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [makeRpeRow({ player_id: "player-1", rpe: 7 })],
      feedbackRows: [makeFeedbackRow({ player_id: "player-1", rating: null })],
      activePlayerIds: ["player-1"],
    });

    expect(result).toEqual([
      { userId: "player-1", missingRpe: false, missingFeedback: true },
    ]);
  });

  // =========================================================================
  // CAS 4 — LIMITE : absent / excused / pending exclus des attendus
  // =========================================================================
  it("exclut les joueurs absent, excused ou pending des attendus", () => {
    const result = computeMissingResponders({
      attendances: [
        makeAttendance({ user_id: "player-absent", status: "absent" }),
        makeAttendance({ user_id: "player-excused", status: "excused" }),
        makeAttendance({ user_id: "player-pending", status: "pending" }),
      ],
      rpeRows: [],
      feedbackRows: [],
      activePlayerIds: ["player-absent", "player-excused", "player-pending"],
    });

    expect(result).toEqual([]);
  });

  // =========================================================================
  // CAS 5 — LIMITE : joueur "late" inclus dans les attendus
  // =========================================================================
  it("inclut un joueur 'late' dans les attendus", () => {
    const result = computeMissingResponders({
      attendances: [makeAttendance({ user_id: "player-late", status: "late" })],
      rpeRows: [],
      feedbackRows: [],
      activePlayerIds: ["player-late"],
    });

    expect(result).toEqual([
      { userId: "player-late", missingRpe: true, missingFeedback: true },
    ]);
  });

  // =========================================================================
  // CAS 6 — LIMITE : joueur présent mais profil désactivé (absent de activePlayerIds)
  // =========================================================================
  it("exclut un joueur présent mais dont le profil est désactivé", () => {
    const result = computeMissingResponders({
      attendances: [makeAttendance({ user_id: "player-inactive", status: "present" })],
      rpeRows: [],
      feedbackRows: [],
      activePlayerIds: [], // profil désactivé → absent de la liste active
    });

    expect(result).toEqual([]);
  });

  // =========================================================================
  // CAS 7 — LIMITE : personne ne manque → tableau vide
  // =========================================================================
  it("retourne un tableau vide quand tous les joueurs attendus ont tout rempli", () => {
    const result = computeMissingResponders({
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [makeRpeRow({ player_id: "player-1", rpe: 5 })],
      feedbackRows: [makeFeedbackRow({ player_id: "player-1", rating: 5 })],
      activePlayerIds: ["player-1"],
    });

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite : sendSessionReminders (cron, mock Supabase)
// ---------------------------------------------------------------------------

describe("sendSessionReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const now = new Date().toISOString();

  // =========================================================================
  // CAS 8 — NOMINAL : 1 event training passé, 1 joueur manquant → 1 notification
  // =========================================================================
  it("insère une notification relance_seance pour un joueur manquant sur un entraînement passé", async () => {
    const event = makeEvent();
    const supabase = makeSupabase({
      events: [event],
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [], // RPE manquant
      feedbackRows: [], // feedback manquant
      parentLinks: [],
      teamSettings: [{ team_id: "team-1", rpe_reminders_enabled: true }],
      existingNotifications: [],
    });

    const count = await sendSessionReminders(supabase, now);

    expect(supabase._notificationsInsertMock).toHaveBeenCalled();
    const insertedRows: unknown[] = supabase._notificationsInsertMock.mock.calls[0][0];
    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0] as {
      type: string;
      reference_id: string;
      url: string;
      team_id: string;
      user_id: string;
    };
    expect(row.type).toBe("relance_seance");
    expect(row.reference_id).toBe(`seance-relance:${event.id}:player-1`);
    expect(row.url).toBe(`/trainings/${event.id}`);
    expect(row.team_id).toBe("team-1");
    expect(count).toBe(1);
  });

  // =========================================================================
  // CAS 9 — DEDUP : notification déjà existante avec ce reference_id → aucune insertion
  // =========================================================================
  it("n'insère rien si une notification relance_seance existe déjà pour ce reference_id", async () => {
    const event = makeEvent();
    const supabase = makeSupabase({
      events: [event],
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [],
      feedbackRows: [],
      parentLinks: [],
      teamSettings: [{ team_id: "team-1", rpe_reminders_enabled: true }],
      existingNotifications: [
        { reference_id: `seance-relance:${event.id}:player-1` },
      ],
    });

    const count = await sendSessionReminders(supabase, now);

    expect(supabase._notificationsInsertMock).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  // =========================================================================
  // CAS 10 — PARENTS : joueur manquant + 1 parent lié → 2 notifications,
  // dédup par destinataire (clé différente pour le joueur et pour le parent)
  // =========================================================================
  it("notifie aussi le parent lié avec une clé de dédup propre au destinataire", async () => {
    const event = makeEvent();
    const supabase = makeSupabase({
      events: [event],
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [],
      feedbackRows: [],
      parentLinks: [{ parent_id: "parent-1", student_id: "player-1", team_id: "team-1" }],
      teamSettings: [{ team_id: "team-1", rpe_reminders_enabled: true }],
      existingNotifications: [],
    });

    const count = await sendSessionReminders(supabase, now);

    expect(supabase._notificationsInsertMock).toHaveBeenCalled();
    const insertedRows: unknown[] = supabase._notificationsInsertMock.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);

    const refIds = insertedRows.map((r) => (r as { reference_id: string }).reference_id);
    // Clé de dédup distincte par destinataire : joueur et parent ont chacun leur propre userId
    expect(refIds).toContain(`seance-relance:${event.id}:player-1`);
    expect(refIds).toContain(`seance-relance:${event.id}:parent-1`);
    expect(new Set(refIds).size).toBe(2); // pas de clé partagée entre les deux destinataires

    expect(count).toBe(2);
  });

  // =========================================================================
  // CAS 11 — OPT-OUT : team_settings.rpe_reminders_enabled = false → aucune insertion
  // =========================================================================
  it("n'insère aucune notification si l'équipe a désactivé les rappels RPE", async () => {
    const event = makeEvent();
    const supabase = makeSupabase({
      events: [event],
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [],
      feedbackRows: [],
      parentLinks: [],
      teamSettings: [{ team_id: "team-1", rpe_reminders_enabled: false }],
      existingNotifications: [],
    });

    const count = await sendSessionReminders(supabase, now);

    expect(supabase._notificationsInsertMock).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  // =========================================================================
  // CAS 16 — LIMITE : event de type match → ignoré par sendSessionReminders
  // =========================================================================
  it("ignore un event de type match", async () => {
    const event = makeEvent({ type: "match" });
    const supabase = makeSupabase({
      events: [event],
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [],
      feedbackRows: [],
      parentLinks: [],
      teamSettings: [{ team_id: "team-1", rpe_reminders_enabled: true }],
      existingNotifications: [],
    });

    const count = await sendSessionReminders(supabase, now);

    expect(supabase._notificationsInsertMock).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });

  // =========================================================================
  // CAS 17 — LIMITE : équipe sans ligne team_settings → relance autorisée (défaut true)
  // =========================================================================
  it("autorise la relance quand l'équipe n'a aucune ligne team_settings", async () => {
    const event = makeEvent();
    const supabase = makeSupabase({
      events: [event],
      attendances: [makeAttendance({ user_id: "player-1", status: "present" })],
      rpeRows: [],
      feedbackRows: [],
      parentLinks: [],
      teamSettings: [], // aucune ligne pour team-1
      existingNotifications: [],
    });

    const count = await sendSessionReminders(supabase, now);

    expect(supabase._notificationsInsertMock).toHaveBeenCalled();
    expect(count).toBe(1);
  });

  // =========================================================================
  // CAS 18 — NON-RÉGRESSION : joueur présent avec RPE manquant mais profil
  // désactivé (profiles.is_active = false) → aucune notification insérée
  // =========================================================================
  it("n'insère aucune notification pour un joueur présent dont le profil est désactivé", async () => {
    const event = makeEvent();
    const supabase = makeSupabase({
      events: [event],
      attendances: [makeAttendance({ user_id: "player-inactive", status: "present" })],
      rpeRows: [], // RPE manquant
      feedbackRows: [], // feedback manquant
      parentLinks: [],
      teamSettings: [{ team_id: "team-1", rpe_reminders_enabled: true }],
      existingNotifications: [],
      profiles: [], // profil désactivé → absent de la liste des profils actifs
    });

    const count = await sendSessionReminders(supabase, now);

    expect(supabase._notificationsInsertMock).not.toHaveBeenCalled();
    expect(count).toBe(0);
  });
});
