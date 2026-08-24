/**
 * Tests TDD — createAutoConvocations (Phase 2.1 RED)
 *
 * Feature cible : la fonction lit les événements dont `event_date` tombe
 * dans la fenêtre `[now, now + convocation_lead_days]` ET dont
 * `convocations_sent_at IS NULL`, puis crée les lignes `attendances` et
 * insère des notifications de type "convocation" pour les joueurs actifs +
 * leurs parents.
 *
 * Schéma DB réel :
 *   - `events.convocation_lead_days` (INTEGER, défaut 3)
 *   - `events.convocations_sent_at` (TIMESTAMPTZ, nullable)
 *   - `team_settings` : RPE / reminders (pas convocation_lead_days pour l'instant)
 *   - `attendances` : event_id, user_id, team_id, status
 *   - `notifications` : user_id, team_id, type, reference_id, scheduled_for, ...
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Module non-existant : les tests doivent échouer ici (RED)
import { createAutoConvocations } from "@/lib/auto-convocations";

// ---------------------------------------------------------------------------
// Mock ensureAttendanceRows (on veut tester createAutoConvocations en isolation)
// ---------------------------------------------------------------------------

vi.mock("@/lib/convocations", () => ({
  ensureAttendanceRows: vi.fn().mockResolvedValue(undefined),
}));

import { ensureAttendanceRows } from "@/lib/convocations";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Événement à J+2, non encore convoqué */
function makeEvent(overrides: Partial<{
  id: string;
  team_id: string;
  type: string;
  title: string;
  event_date: string;
  convocation_lead_days: number;
  convocations_sent_at: string | null;
}> = {}) {
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: "event-1",
    team_id: "team-1",
    type: "match",
    title: "Match de championnat",
    event_date: twoDaysFromNow,
    convocation_lead_days: 3,       // fenêtre = 3j → l'événement à J+2 est dans la fenêtre
    convocations_sent_at: null,     // pas encore convoqué
    ...overrides,
  };
}

/** Joueur actif minimal */
function makePlayer(id = "player-1") {
  return { id };
}

/** Parent minimal */
function makeParentLink(parentId = "parent-1", studentId = "player-1") {
  return { parent_id: parentId, student_id: studentId };
}

/**
 * Construit un mock Supabase réaliste avec des handlers par table.
 * Chaque handler reçoit les arguments de `from()` et retourne un builder chaîné.
 */
function makeSupabase(handlers: {
  events?: () => { data: unknown; error: null };
  team_members?: () => { data: unknown; error: null };
  profiles?: () => { data: unknown; error: null };
  parent_student?: () => { data: unknown; error: null };
  notifications?: {
    insert?: () => { error: null };
    select?: () => { data: unknown; error: null };
  };
  attendances?: {
    select?: () => { data: unknown; error: null };
    insert?: () => { error: null };
  };
  events_update?: () => { error: null };
}) {
  // Mock des notifications.insert et events.update pour capturer les appels
  const notificationsInsertMock = vi.fn().mockResolvedValue(
    handlers.notifications?.insert?.() ?? { error: null }
  );
  const eventsUpdateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(handlers.events_update?.() ?? { error: null }),
  });

  const supabase = {
    from: vi.fn((table: string) => {
      // ── EVENTS ──────────────────────────────────────────────────────────────
      if (table === "events") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          // La query SELECT retourne les événements à convoquer
          then: undefined,
          // Terminaison : appel sans chaîne → on résout via un hack promise-like
          // En pratique, vitest attend un vrai then ; on utilise un Proxy ou on
          // résout à la fin de la chaîne `.lte(...)` (dernier filtre).
          // Pattern : le dernier maillon de la chaîne résout la promesse.
          // On override `lte` pour qu'il retourne une promesse résolue.
          update: eventsUpdateMock,
        };
      }

      // ── TEAM_MEMBERS ────────────────────────────────────────────────────────
      if (table === "team_members") {
        const data = handlers.team_members?.().data ?? [{ user_id: "player-1" }];
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data, error: null }),
        };
      }

      // ── PROFILES ────────────────────────────────────────────────────────────
      if (table === "profiles") {
        const data = handlers.profiles?.().data ?? [{ id: "player-1" }];
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data, error: null }),
        };
      }

      // ── PARENT_STUDENT ──────────────────────────────────────────────────────
      if (table === "parent_student") {
        const data = handlers.parent_student?.().data ?? [];
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data, error: null }),
        };
      }

      // ── NOTIFICATIONS ───────────────────────────────────────────────────────
      if (table === "notifications") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue(handlers.notifications?.select?.() ?? { data: [], error: null }),
          insert: notificationsInsertMock,
        };
      }

      // ── ATTENDANCES ──────────────────────────────────────────────────────────
      if (table === "attendances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue(handlers.attendances?.select?.() ?? { data: [], error: null }),
          insert: vi.fn().mockResolvedValue(handlers.attendances?.insert?.() ?? { error: null }),
        };
      }

      // Fallback
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    // On expose les mocks pour les assertions
    _notificationsInsertMock: notificationsInsertMock,
    _eventsUpdateMock: eventsUpdateMock,
  };

  return supabase as unknown as SupabaseClient & {
    _notificationsInsertMock: ReturnType<typeof vi.fn>;
    _eventsUpdateMock: ReturnType<typeof vi.fn>;
  };
}

/**
 * Construit un mock Supabase simplifié avec une liste d'événements retournée
 * par la requête principale (chaîne SELECT → filtres → résolution).
 *
 * On adopte le pattern du test deliver-notifications : mocker chaque table
 * et simuler la chaîne de filtres en terminant sur un `mockResolvedValue`.
 */
function makeSupabaseWithEvents(
  events: ReturnType<typeof makeEvent>[],
  opts: {
    players?: { id: string }[];
    parents?: { parent_id: string; student_id?: string }[];
    existingAttendances?: { user_id: string }[];
    existingNotifications?: { id: string }[];
  } = {}
) {
  const players = opts.players ?? [{ id: "player-1" }];
  const parents = opts.parents ?? [];
  const existingAttendances = opts.existingAttendances ?? [];
  const existingNotifications = opts.existingNotifications ?? [];

  const notificationsInsertMock = vi.fn().mockResolvedValue({ error: null });
  const eventsUpdateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "events") {
        // Chaîne : select → eq (status) → is (convocations_sent_at) → gte → lte
        // On retourne le builder chaîné, et le dernier maillon (`lte`) résout
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          // Dernier filtre de la chaîne → résout la promesse
          lte: vi.fn().mockResolvedValue({ data: events, error: null }),
          // Pour la mise à jour convocations_sent_at
          update: eventsUpdateMock,
        };
        return builder;
      }

      if (table === "team_members") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: players.map((p) => ({ user_id: p.id })),
            error: null,
          }),
        };
      }

      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: players, error: null }),
        };
      }

      if (table === "parent_student") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: parents, error: null }),
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

      if (table === "attendances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: existingAttendances, error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      // Fallback
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }),
    _notificationsInsertMock: notificationsInsertMock,
    _eventsUpdateMock: eventsUpdateMock,
  };

  return supabase as unknown as SupabaseClient & {
    _notificationsInsertMock: ReturnType<typeof vi.fn>;
    _eventsUpdateMock: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Suite principale
// ---------------------------------------------------------------------------

describe("createAutoConvocations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // CAS 1 — NOMINAL : événement dans la fenêtre → convocations créées
  // =========================================================================
  it("crée les convocations et notifications pour un événement dans la fenêtre lead_days", async () => {
    const event = makeEvent(); // J+2, convocation_lead_days=3 → dans la fenêtre
    const supabase = makeSupabaseWithEvents([event], {
      players: [{ id: "player-1" }, { id: "player-2" }],
    });

    const result = await createAutoConvocations(supabase);

    // La fonction doit avoir traité 1 événement
    expect(result.eventsProcessed).toBe(1);

    // Des notifications doivent avoir été insérées
    expect(supabase._notificationsInsertMock).toHaveBeenCalled();

    // La notification doit être de type "convocation" avec reference_id = event.id
    const insertedRows: unknown[] = supabase._notificationsInsertMock.mock.calls[0][0];
    expect(Array.isArray(insertedRows)).toBe(true);
    expect(insertedRows.length).toBeGreaterThanOrEqual(1);
    insertedRows.forEach((row: unknown) => {
      expect((row as { type: string }).type).toBe("convocation");
      expect((row as { reference_id: string }).reference_id).toBe(event.id);
    });

    // Le nombre de notifications créées doit être dans le résultat
    expect(result.notificationsCreated).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // CAS 2 — DEDUP : événement déjà convoqué (convocations_sent_at non null) → skip
  // =========================================================================
  it("ne crée aucune convocation si convocations_sent_at est déjà renseigné (dedup)", async () => {
    // L'événement est déjà convoqué
    const event = makeEvent({ convocations_sent_at: "2026-08-20T10:00:00Z" });
    // On passe un événement déjà convoqué → la query SELECT with IS NULL ne devrait
    // pas le retourner. On simule cela en retournant une liste vide.
    const supabase = makeSupabaseWithEvents(
      [], // aucun événement à convoquer (filtré par IS NULL côté Supabase)
      { players: [{ id: "player-1" }] }
    );

    const result = await createAutoConvocations(supabase);

    // Aucun événement traité
    expect(result.eventsProcessed).toBe(0);
    expect(result.notificationsCreated).toBe(0);

    // Aucune notification insérée
    expect(supabase._notificationsInsertMock).not.toHaveBeenCalled();

    // ensureAttendanceRows ne doit pas être appelé
    expect(ensureAttendanceRows).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CAS 3 — ERREUR MÉTIER : convocation_lead_days = 0 → pas d'auto-convocation
  // =========================================================================
  it("ne crée pas de convocations si convocation_lead_days vaut 0 ou null", async () => {
    // Événement à J+2 mais lead_days=0 → la fenêtre = [now, now] → événement hors fenêtre
    // On simule : la query retourne rien car l'événement n'est pas dans la fenêtre
    // (le filtre `lte(event_date, now + 0j)` exclurait un événement à J+2)
    const supabase = makeSupabaseWithEvents(
      [], // aucun événement dans la fenêtre lead_days=0
      { players: [{ id: "player-1" }] }
    );

    const result = await createAutoConvocations(supabase);

    expect(result.eventsProcessed).toBe(0);
    expect(result.notificationsCreated).toBe(0);
    expect(supabase._notificationsInsertMock).not.toHaveBeenCalled();
  });

  // =========================================================================
  // CAS 4 — CAS LIMITE : joueur déjà convoqué manuellement → pas de doublon attendance
  // =========================================================================
  it("n'insère pas de doublon attendance si le joueur est déjà convoqué manuellement", async () => {
    const event = makeEvent();
    const supabase = makeSupabaseWithEvents([event], {
      players: [{ id: "player-1" }],
      // attendance existante pour player-1 → ensureAttendanceRows doit la détecter
      existingAttendances: [{ user_id: "player-1" }],
    });

    await createAutoConvocations(supabase);

    // ensureAttendanceRows doit être appelé : c'est lui qui gère le dedup
    // Il reçoit les userIds à convoquer et filtre les doublons lui-même
    expect(ensureAttendanceRows).toHaveBeenCalledWith(
      event.id,
      event.team_id,
      expect.arrayContaining(["player-1"])
    );

    // Une notification est quand même créée (la convocation push, même si l'attendance existait)
    // c'est la logique métier : on notifie mais on ne duplique pas l'attendance
    expect(supabase._notificationsInsertMock).toHaveBeenCalled();
  });

  // =========================================================================
  // CAS 5 — NOMINAL : les parents des joueurs convoqués reçoivent aussi la notif
  // =========================================================================
  it("inclut les parents des joueurs convoqués dans les notifications", async () => {
    const event = makeEvent();
    const supabase = makeSupabaseWithEvents([event], {
      players: [{ id: "player-1" }],
      parents: [makeParentLink("parent-1", "player-1")],
    });

    const result = await createAutoConvocations(supabase);

    // Des notifications doivent avoir été insérées
    expect(supabase._notificationsInsertMock).toHaveBeenCalled();

    // Les notifications doivent inclure à la fois player-1 ET parent-1
    const insertedRows: unknown[] = supabase._notificationsInsertMock.mock.calls[0][0];
    const notifiedUserIds = insertedRows.map((r: unknown) => (r as { user_id: string }).user_id);

    expect(notifiedUserIds).toContain("player-1");
    expect(notifiedUserIds).toContain("parent-1");

    // 2 notifications = 1 joueur + 1 parent
    expect(result.notificationsCreated).toBe(2);
  });
});
