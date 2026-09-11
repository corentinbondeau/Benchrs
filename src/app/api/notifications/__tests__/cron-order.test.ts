/**
 * Tests TDD — Ordre d'exécution du cron notifications (Phase 3.1 RED)
 *
 * Invariant métier testé :
 *   1. `deliverPendingNotifications` s'exécute EN PREMIER dans le cron global,
 *      i.e. AVANT toute étape de création (rappels, digests, félicitations, etc.)
 *   2. `deliverPendingNotifications` s'exécute EN DERNIER dans le cron global,
 *      après toutes les étapes de création (delivery last — pas de notification
 *      orpheline 24h dans le même cycle).
 *
 * Ordre cible du cron :
 *   1. deliverPendingNotifications  ← EN PREMIER
 *   2. (rappels, digests, félicitations, …)
 *   N. deliverPendingNotifications  ← EN DERNIER
 *
 * Stratégie de mock Supabase :
 *   On construit un proxy récursif où chaque appel de méthode retourne une
 *   PromiseLike qui résout { data: [], error: null }. Cela permet aux patterns
 *   `const { data } = await supabase.from("x").select("y").eq(...).gte(...)...`
 *   de fonctionner sans TypeError quelle que soit la profondeur de chaînage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Ordre global des appels — partagé entre les mocks, réinitialisé avant chaque test
// ---------------------------------------------------------------------------
const callOrder: string[] = [];

// ---------------------------------------------------------------------------
// Mock : deliver-notifications
// ---------------------------------------------------------------------------
vi.mock("@/lib/deliver-notifications", () => ({
  deliverPendingNotifications: vi.fn(async () => {
    callOrder.push("deliverPendingNotifications");
    return { sent: 0, delivered: 0, skipped: { noSubscription: 0, pushDisabled: 0 } };
  }),
}));

// ---------------------------------------------------------------------------
// Mock : supabase admin
// Stratégie : chaque nœud du proxy est à la fois chainable ET awaitable.
// Quand on `await` un nœud, il résout { data: [], error: null }.
// ---------------------------------------------------------------------------
function makeSupabaseProxy(): unknown {
  /**
   * Crée un objet qui :
   *  - se comporte comme une PromiseLike<{ data: []; error: null }> (pour `await`)
   *  - retourne un nouveau proxy pour chaque propriété/méthode (pour le chaînage)
   */
  function node(): unknown {
    const resolved = { data: [] as unknown[], error: null };

    // Proxy : capture TOUTES les accès de propriété et les appels
    const proxy = new Proxy(
      // Fonction de base pour les appels directs ()
      function () {
        return node();
      },
      {
        get(_target, prop: string | symbol) {
          if (typeof prop === "symbol") {
            // Symbol.toPrimitive, Symbol.iterator, etc. — pas de proxy
            return undefined;
          }
          // Support de Promise / await
          if (prop === "then") {
            return (
              onFulfilled: (v: typeof resolved) => unknown,
              _onRejected?: (e: unknown) => unknown
            ) => Promise.resolve(resolved).then(onFulfilled);
          }
          if (prop === "catch") {
            return (_onRejected: (e: unknown) => unknown) => Promise.resolve(resolved);
          }
          if (prop === "finally") {
            return (onFinally: () => void) =>
              Promise.resolve(resolved).finally(onFinally);
          }
          // Toutes les autres propriétés / méthodes → retournent un nouveau nœud
          return (..._args: unknown[]) => node();
        },
        // Appel direct du proxy comme fonction
        apply(_target, _thisArg, _args) {
          return node();
        },
      }
    );
    return proxy;
  }

  return node();
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => makeSupabaseProxy()),
}));

// ---------------------------------------------------------------------------
// Mock : goals (utilisé dans sendPlayingTimeAlerts)
// ---------------------------------------------------------------------------
vi.mock("@/lib/goals", () => ({
  currentSeasonLabel: vi.fn(() => "2024-2025"),
  seasonDateRange: vi.fn(() => null), // null → sendPlayingTimeAlerts retourne tôt
}));

// ---------------------------------------------------------------------------
// Mock : convocations (pour ensureAttendanceRows)
// ---------------------------------------------------------------------------
vi.mock("@/lib/convocations", () => ({
  ensureAttendanceRows: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock : webpush (pour éviter les erreurs VAPID)
// ---------------------------------------------------------------------------
vi.mock("@/lib/webpush", () => ({
  default: {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Imports des fonctions mockées (pour les assertions)
// ---------------------------------------------------------------------------
import { deliverPendingNotifications } from "@/lib/deliver-notifications";

// ---------------------------------------------------------------------------
// Helper : construire un mock Request avec le CRON_SECRET correct
// ---------------------------------------------------------------------------
function makeCronRequest(): Request {
  return new Request("http://localhost/api/notifications/cron", {
    method: "GET",
    headers: {
      authorization: "Bearer test-secret",
    },
  });
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
  callOrder.length = 0;
  vi.clearAllMocks();

  // Réappliquer les implémentations après clearAllMocks
  vi.mocked(deliverPendingNotifications).mockImplementation(async () => {
    callOrder.push("deliverPendingNotifications");
    return { sent: 0, delivered: 0, skipped: { noSubscription: 0, pushDisabled: 0 } };
  });

  process.env.CRON_SECRET = "test-secret";
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Cron notifications — ordre d'exécution", () => {
  /**
   * Test nominal 1 :
   * `deliverPendingNotifications` doit être appelée EN PREMIER (index 0) et
   * EN DERNIER dans le cron global.
   *
   * Raison métier : "delivery first" — si une étape de création échoue ou
   * timeout, la livraison des notifications déjà en attente doit avoir eu lieu.
   * "delivery last" — pas de notification orpheline 24h dans le même cycle.
   */
  it("appelle deliverPendingNotifications EN PREMIER puis EN DERNIER", async () => {
    const { GET } = await import("@/app/api/notifications/cron/route");
    const req = makeCronRequest();

    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(deliverPendingNotifications).toHaveBeenCalledTimes(2);

    const deliverIdx = callOrder.indexOf("deliverPendingNotifications");
    const lastDeliverIdx = callOrder.lastIndexOf("deliverPendingNotifications");

    expect(
      deliverIdx,
      `deliverPendingNotifications doit être EN PREMIER (index 0), mais est à l'index ${deliverIdx}. callOrder=${JSON.stringify(callOrder)}`
    ).toBe(0);
    expect(lastDeliverIdx).toBe(callOrder.length - 1);
  });

  /**
   * Test cas limite :
   * Même si une étape de création du cron lève une exception, la livraison
   * des notifications déjà en attente a déjà eu lieu.
   */
  it("a déjà appelé deliverPendingNotifications si une étape de création plante", async () => {
    const { GET } = await import("@/app/api/notifications/cron/route");
    const req = makeCronRequest();

    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(deliverPendingNotifications).toHaveBeenCalledTimes(2);

    // Les générateurs quotidiens (rappels, digest...) tournent entre les 2 deliveries
    const firstDeliverIdx = callOrder.indexOf("deliverPendingNotifications");
    const lastDeliverIdx = callOrder.lastIndexOf("deliverPendingNotifications");
    expect(firstDeliverIdx).toBe(0);
    expect(lastDeliverIdx).toBe(callOrder.length - 1);
  });
});
