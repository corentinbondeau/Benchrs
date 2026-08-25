/**
 * Tests TDD — Ordre d'exécution du cron notifications (Phase 3.1 RED)
 *
 * Invariant métier testé :
 *   1. `deliverPendingNotifications` s'exécute AVANT `createAutoConvocations`
 *      ("delivery first" — garantit la livraison même si une étape de création
 *      échoue ou timeout).
 *   2. `deliverPendingNotifications` s'exécute EN PREMIER dans le cron global,
 *      i.e. AVANT toute étape de création (rappels, digests, félicitations, etc.)
 *
 * Ordre cible du cron réordonné :
 *   1. deliverPendingNotifications  ← EN PREMIER
 *   2. createAutoConvocations
 *   3. (rappels, digests, félicitations, …)
 *
 * Ordre actuel (avant refactoring) :
 *   rappels → digest → expirations → relances → temps de jeu → cotisations →
 *   félicitations → createAutoConvocations → deliverPendingNotifications
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
// Mock : auto-convocations
// ---------------------------------------------------------------------------
vi.mock("@/lib/auto-convocations", () => ({
  createAutoConvocations: vi.fn(async () => {
    callOrder.push("createAutoConvocations");
    return { eventsProcessed: 0, notificationsCreated: 0 };
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
import { createAutoConvocations } from "@/lib/auto-convocations";

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
  vi.mocked(createAutoConvocations).mockImplementation(async () => {
    callOrder.push("createAutoConvocations");
    return { eventsProcessed: 0, notificationsCreated: 0 };
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
   * `deliverPendingNotifications` doit être appelée AVANT `createAutoConvocations`.
   *
   * Raison métier : "delivery first" — si une étape de création échoue ou
   * timeout, la livraison des notifications déjà en attente doit avoir eu lieu.
   * De plus, les convocations auto créées dans cette passe seront livrées au
   * prochain cron (comportement acceptable).
   */
  it("appelle deliverPendingNotifications AVANT createAutoConvocations", async () => {
    const { GET } = await import("@/app/api/notifications/cron/route");
    const req = makeCronRequest();

    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(deliverPendingNotifications).toHaveBeenCalledOnce();
    expect(createAutoConvocations).toHaveBeenCalledOnce();

    const deliverIdx = callOrder.indexOf("deliverPendingNotifications");
    const autoConvoIdx = callOrder.indexOf("createAutoConvocations");

    expect(deliverIdx, "deliverPendingNotifications doit être dans callOrder").toBeGreaterThanOrEqual(0);
    expect(autoConvoIdx, "createAutoConvocations doit être dans callOrder").toBeGreaterThanOrEqual(0);

    expect(
      deliverIdx,
      `deliverPendingNotifications (idx=${deliverIdx}) doit être AVANT createAutoConvocations (idx=${autoConvoIdx}). callOrder=${JSON.stringify(callOrder)}`
    ).toBeLessThan(autoConvoIdx);
  });

  /**
   * Test nominal 2 :
   * `deliverPendingNotifications` doit être EN PREMIER dans le callOrder global
   * (index 0), avant même `createAutoConvocations`.
   *
   * Raison métier : si une étape de création (rappels, digests) échoue ou
   * timeout, la delivery des notifications déjà en attente doit avoir eu lieu.
   * Delivery first = garantie de livraison même en cas d'erreur partielle.
   */
  it("appelle deliverPendingNotifications EN PREMIER (index 0 dans callOrder)", async () => {
    const { GET } = await import("@/app/api/notifications/cron/route");
    const req = makeCronRequest();

    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(deliverPendingNotifications).toHaveBeenCalledOnce();
    expect(createAutoConvocations).toHaveBeenCalledOnce();

    const deliverIdx = callOrder.indexOf("deliverPendingNotifications");
    const autoConvoIdx = callOrder.indexOf("createAutoConvocations");

    expect(
      deliverIdx,
      `deliverPendingNotifications doit être EN PREMIER (index 0), mais est à l'index ${deliverIdx}. callOrder=${JSON.stringify(callOrder)}`
    ).toBe(0);

    expect(
      autoConvoIdx,
      `createAutoConvocations (idx=${autoConvoIdx}) doit venir APRÈS deliverPendingNotifications (idx=${deliverIdx})`
    ).toBeGreaterThan(deliverIdx);
  });

  /**
   * Test cas limite :
   * Même si `createAutoConvocations` lève une exception, `deliverPendingNotifications`
   * a déjà été appelé (car il est en premier dans l'ordre cible).
   *
   * Vérifie la résilience : une erreur lors de la création des convocations
   * ne doit pas bloquer la livraison des notifications déjà en attente.
   */
  it("a déjà appelé deliverPendingNotifications si createAutoConvocations échoue", async () => {
    // Surcharger createAutoConvocations pour qu'il enregistre son appel puis plante
    vi.mocked(createAutoConvocations).mockImplementationOnce(async () => {
      callOrder.push("createAutoConvocations");
      throw new Error("createAutoConvocations timeout simulé");
    });

    const { GET } = await import("@/app/api/notifications/cron/route");
    const req = makeCronRequest();

    // Le cron peut catcher l'erreur ou la remonter — dans les deux cas,
    // delivery doit avoir été appelé en premier
    try {
      await GET(req);
    } catch {
      // Exception tolérée dans ce test
    }

    // deliverPendingNotifications DOIT avoir été appelé
    expect(
      deliverPendingNotifications,
      "deliverPendingNotifications doit avoir été appelé même si createAutoConvocations échoue"
    ).toHaveBeenCalledOnce();

    // Et delivery doit être EN PREMIER
    const deliverIdx = callOrder.indexOf("deliverPendingNotifications");
    expect(
      deliverIdx,
      `deliverPendingNotifications doit être EN PREMIER (index 0). callOrder=${JSON.stringify(callOrder)}`
    ).toBe(0);
  });
});
