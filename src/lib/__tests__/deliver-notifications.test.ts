/**
 * Tests TDD — deliverPendingNotifications (Phase 1.1 RED)
 *
 * Bug cible : les notifications sans souscription push ou avec préférences
 * désactivées ne sont JAMAIS marquées `delivered_at`, bloquant la file
 * indéfiniment (SELECT LIMIT 500 retourne toujours les mêmes rows).
 *
 * Voir : cron/route.ts lignes 189-195 (deux `continue` qui sautent deliveredIds).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Module non-existant : les tests doivent échouer ici (RED)
import { deliverPendingNotifications } from "@/lib/deliver-notifications";

// ---------------------------------------------------------------------------
// Helpers de mock
// ---------------------------------------------------------------------------

/** Crée un mock minimal du builder chaîné Supabase (from→select→...→data) */
function makeSupabaseMock(tableHandlers: Record<string, () => unknown>) {
  return {
    from: vi.fn((table: string) => {
      const handler = tableHandlers[table];
      const builder: Record<string, unknown> = {};
      const methods = [
        "select", "insert", "update", "delete", "upsert",
        "eq", "in", "lte", "is", "limit", "maybeSingle",
      ] as const;
      methods.forEach((m) => {
        builder[m] = vi.fn((..._args: unknown[]) => {
          // Pour les terminaisons sans chaîne supplémentaire, on retourne le résultat du handler
          if (m === "maybeSingle" || m === "select") {
            // retourner une promesse avec { data, error }
            return Promise.resolve(handler ? handler() : { data: null, error: null });
          }
          return builder; // chaînable
        });
      });
      // Certains builders se terminent sans appel explicite → on rend la promesse résolvable
      (builder as Record<string, unknown>).then = undefined; // pas une Promise native
      return builder;
    }),
  } as unknown as SupabaseClient;
}

/** Notification pending minimale */
function makeNotif(overrides: Partial<{
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  reference_id: string | null;
  team_id: string;
  url: string | null;
}> = {}) {
  return {
    id: "notif-1",
    user_id: "user-1",
    title: "Test notif",
    body: "Corps de la notif",
    type: "rappel",
    reference_id: null,
    team_id: "team-1",
    url: "/calendar",
    ...overrides,
  };
}

/** Souscription push minimale */
function makeSub(overrides: Partial<{
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}> = {}) {
  return {
    user_id: "user-1",
    endpoint: "https://fcm.example.com/endpoint",
    p256dh: "p256dhkey",
    auth: "authkey",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock webpush  (le vrai module appelle VAPID → erreur en env test)
// ---------------------------------------------------------------------------

vi.mock("@/lib/webpush", () => ({
  default: {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Mock ensureAttendanceRows
// ---------------------------------------------------------------------------

vi.mock("@/lib/convocations", () => ({
  ensureAttendanceRows: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import des mocks APRÈS vi.mock() (hoistés par Vitest)
// ---------------------------------------------------------------------------

import webpush from "@/lib/webpush";
import { ensureAttendanceRows } from "@/lib/convocations";

// ---------------------------------------------------------------------------
// Suite principale
// ---------------------------------------------------------------------------

describe("deliverPendingNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // CAS 1 — NOMINAL : push envoyé + delivered_at marqué
  // =========================================================================
  it("envoie le push et marque delivered_at quand une souscription active existe", async () => {
    const notif = makeNotif();
    const sub = makeSub();

    // Chaîne Supabase : on construit un mock "réaliste" pour chaque table
    const updateMock = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "notifications") {
          return {
            select: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [notif], error: null }),
            update: updateMock,
          };
        }
        if (table === "notification_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }), // pas de pref → push activé par défaut
          };
        }
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [sub], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await deliverPendingNotifications(supabase);

    // webpush.sendNotification doit avoir été appelé UNE fois
    expect(webpush.sendNotification).toHaveBeenCalledOnce();

    // La notification doit être marquée delivered_at
    expect(updateMock).toHaveBeenCalled();

    // Le résultat reflète 1 push envoyé, 1 livré, 0 skipped
    expect(result.sent).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.skipped.noSubscription).toBe(0);
    expect(result.skipped.pushDisabled).toBe(0);
  });

  // =========================================================================
  // CAS 2 — ERREUR MÉTIER : pas de souscription → skipped mais delivered_at quand même
  // BUG CIBLE : le `continue` ligne 195 du cron actuel empêche le marquage
  // =========================================================================
  it("marque delivered_at même quand aucune souscription push n'existe (bug bloquant)", async () => {
    const notif = makeNotif();

    const deliveredIds: string[] = [];
    const updateInMock = vi.fn((...ids: unknown[]) => {
      // Capture les ids marqués delivered
      if (Array.isArray(ids[0])) deliveredIds.push(...ids[0]);
      return Promise.resolve({ error: null });
    });
    const updateMock = vi.fn().mockReturnValue({ in: updateInMock });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "notifications") {
          return {
            select: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [notif], error: null }),
            update: updateMock,
          };
        }
        if (table === "notification_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            // Pas de souscription pour cet utilisateur
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await deliverPendingNotifications(supabase);

    // Aucun push ne doit être envoyé
    expect(webpush.sendNotification).not.toHaveBeenCalled();

    // La notification DOIT quand même être marquée delivered_at (correction du bug)
    expect(updateMock).toHaveBeenCalled();

    // Compteurs
    expect(result.sent).toBe(0);
    expect(result.delivered).toBe(1);           // marqué delivered même sans push
    expect(result.skipped.noSubscription).toBe(1);
    expect(result.skipped.pushDisabled).toBe(0);
  });

  // =========================================================================
  // CAS 3 — ERREUR MÉTIER : préférences push désactivées → skipped mais delivered_at
  // BUG CIBLE : le `continue` ligne 191 du cron actuel empêche le marquage
  // =========================================================================
  it("marque delivered_at même quand push_enabled=false dans les préférences (bug bloquant)", async () => {
    const notif = makeNotif();
    const sub = makeSub(); // souscription existe mais pref OFF

    const updateMock = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "notifications") {
          return {
            select: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [notif], error: null }),
            update: updateMock,
          };
        }
        if (table === "notification_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{
                user_id: notif.user_id,
                team_id: notif.team_id,
                type: notif.type,
                push_enabled: false, // ← désactivé
              }],
              error: null,
            }),
          };
        }
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [sub], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await deliverPendingNotifications(supabase);

    // Aucun push (pref off)
    expect(webpush.sendNotification).not.toHaveBeenCalled();

    // Mais delivered_at DOIT être marqué (correction du bug)
    expect(updateMock).toHaveBeenCalled();

    // Compteurs
    expect(result.sent).toBe(0);
    expect(result.delivered).toBe(1);
    expect(result.skipped.pushDisabled).toBe(1);
    expect(result.skipped.noSubscription).toBe(0);
  });

  // =========================================================================
  // CAS 4 — CAS LIMITE : souscription expirée (410/404) → nettoyage DB + delivered_at
  // =========================================================================
  it("supprime la souscription expirée (410) et marque quand même delivered_at", async () => {
    const notif = makeNotif();
    const expiredSub = makeSub({ endpoint: "https://fcm.example.com/expired" });

    const deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const updateMock = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    });

    // webpush throw une erreur 410 (Gone)
    const pushError = Object.assign(new Error("Gone"), { statusCode: 410 });
    vi.mocked(webpush.sendNotification).mockRejectedValueOnce(pushError);

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "notifications") {
          return {
            select: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [notif], error: null }),
            update: updateMock,
          };
        }
        if (table === "notification_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [expiredSub], error: null }),
            delete: deleteMock,
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await deliverPendingNotifications(supabase);

    // Le push a été tenté
    expect(webpush.sendNotification).toHaveBeenCalledOnce();

    // La souscription expirée doit être supprimée
    expect(deleteMock).toHaveBeenCalled();

    // La notification doit quand même être marquée delivered_at
    expect(updateMock).toHaveBeenCalled();

    // Résultat : push tenté mais échoué (sent=0 car erreur), delivered=1
    expect(result.delivered).toBe(1);
    expect(result.sent).toBe(0); // push a échoué
  });

  // =========================================================================
  // CAS 5 — CONVOCATION : ensureAttendanceRows + convocations_sent_at
  // =========================================================================
  it("appelle ensureAttendanceRows et met à jour convocations_sent_at pour une notification de type convocation", async () => {
    const convoNotif = makeNotif({
      id: "notif-convo",
      user_id: "user-1",
      type: "convocation",
      reference_id: "event-42",
      team_id: "team-1",
    });
    const sub = makeSub();

    const eventsUpdateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const notificationsUpdateMock = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "notifications") {
          return {
            select: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [convoNotif], error: null }),
            update: notificationsUpdateMock,
          };
        }
        if (table === "notification_preferences") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [sub], error: null }),
          };
        }
        if (table === "events") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: eventsUpdateMock,
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await deliverPendingNotifications(supabase);

    // ensureAttendanceRows doit être appelé avec les bons paramètres
    expect(ensureAttendanceRows).toHaveBeenCalledWith(
      "event-42",
      "team-1",
      expect.arrayContaining(["user-1"])
    );

    // convocations_sent_at doit être mis à jour sur l'événement
    expect(eventsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ convocations_sent_at: expect.any(String) })
    );

    // La convocation est livrée normalement
    expect(result.delivered).toBe(1);
    expect(result.sent).toBe(1);
  });

  // =========================================================================
  // CAS 6 — LISTE VIDE : aucune notification pending → résultat neutre
  // =========================================================================
  it("retourne des compteurs à zéro quand il n'y a aucune notification pending", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "notifications") {
          return {
            select: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: vi.fn(),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    } as unknown as SupabaseClient;

    const result = await deliverPendingNotifications(supabase);

    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.delivered).toBe(0);
    expect(result.skipped.noSubscription).toBe(0);
    expect(result.skipped.pushDisabled).toBe(0);
  });
});
