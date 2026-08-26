/**
 * Tests — QueryCache optimisé (sessionStorage persistence + stale-while-revalidate)
 *
 * Périmètre :
 *   1. Nominal     : useQueryCache retourne données cachées + rafraîchit en background
 *   2. Persistence : données survivent à unmount/remount via sessionStorage
 *   3. TTL         : TTL différenciés respectés (profiles=5min, events=1min, realtime=30s)
 *   4. Erreur      : fetch échoué caché 5s, pas de retry immédiat
 *   5. SWR         : hook retourne data (stale) + isRevalidating=true pendant refetch
 *
 * Phase "Red" attendue :
 *   - Tests #2 Persistence [RED], #5 SWR [RED] DOIVENT ÉCHOUER
 *     (sessionStorage + isRevalidating pas encore implémentés)
 *   - Tests #1 Nominal, #3 TTL, #4 Erreur, #6 Utilitaires doivent PASSER
 *
 * Hors-scope :
 *   - Migration vers React Query / SWR (bibliothèques externes)
 *   - Test de performance réseau réel
 *   - Test des 9+ widgets consommateurs (couverture dans leurs propres tests)
 *
 * Note technique sur les timers :
 *   Les tests async (renderHook + waitFor) utilisent les vrais timers pour éviter
 *   le deadlock entre vi.useFakeTimers() et waitFor() de testing-library.
 *   Les tests de TTL purs (getQueryCache/setQueryCache) utilisent vi.useFakeTimers()
 *   pour avancer le temps sans bloquer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes TTL attendues après optimisation
// ─────────────────────────────────────────────────────────────────────────────

/** TTL profiles/teams : 5 minutes */
const TTL_PROFILES = 5 * 60 * 1_000;
/** TTL events : 1 minute */
const TTL_EVENTS = 60_000;
/** TTL realtime : 30 secondes (valeur actuelle DEFAULT_TTL) */
const TTL_REALTIME = 30_000;
/** TTL erreurs : 5 secondes */
const TTL_ERROR = 5_000;

/** Préfixe de clé sessionStorage (doit correspondre à l'implémentation) */
const SS_PREFIX = "benchrs:qc:";

// ─────────────────────────────────────────────────────────────────────────────
// Import du SUT
// ─────────────────────────────────────────────────────────────────────────────

import {
  useQueryCache,
  getQueryCache,
  setQueryCache,
  clearQueryCache,
  DEFAULT_TTL,
} from "@/lib/queryCache";

// ─────────────────────────────────────────────────────────────────────────────
// Setup / Teardown
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Nettoyage entre chaque test — le setup global appelle clearQueryCache()
  // On vide aussi sessionStorage pour garantir l'isolation.
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  sessionStorage.clear();
  clearQueryCache();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CAS NOMINAL — données cachées + rafraîchissement background
// ─────────────────────────────────────────────────────────────────────────────

describe("useQueryCache — cas nominal", () => {
  it("retourne loading=true et data=null au premier rendu (avant fetch)", async () => {
    let resolveData!: (v: string[]) => void;
    const slowFetcher = vi.fn(
      () => new Promise<string[]>((r) => { resolveData = r; })
    );

    const { result } = renderHook(() =>
      useQueryCache("test:slow", slowFetcher)
    );

    // État initial synchrone : loading=true, pas encore de données
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    // Résoudre pour éviter les warnings d'act()
    await act(async () => { resolveData([]); });
  });

  it("retourne les données et loading=false après résolution du fetch", async () => {
    const DATA = ["event-1", "event-2"];
    const fetcher = vi.fn().mockResolvedValue(DATA);

    const { result } = renderHook(() =>
      useQueryCache("test:resolved", fetcher)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual(DATA);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("retourne les données du cache mémoire en premier, puis les données fraîches après refetch", async () => {
    // Note : l'implémentation actuelle fait SWR "partiel" :
    // elle sert les données du cache dès le useState init, puis revalide toujours en background.
    // Ce test valide ce comportement observable (les données stale sont servies en premier).
    const STALE_DATA = { name: "Alice", score: 42 };
    const FRESH_DATA = { name: "Bob", score: 99 };
    const KEY = "test:cache-hit";

    // Pré-peupler le cache mémoire avec données stale
    setQueryCache(KEY, STALE_DATA, TTL_PROFILES);

    let resolveRefetch!: (v: typeof FRESH_DATA) => void;
    const fetcher = vi.fn(
      () => new Promise<typeof FRESH_DATA>((r) => { resolveRefetch = r; })
    );

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher, { ttl: TTL_PROFILES })
    );

    // Les données du cache mémoire sont disponibles immédiatement (loading=false)
    // sans attendre le refetch
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(STALE_DATA);

    // Après résolution du refetch : données fraîches disponibles
    await act(async () => { resolveRefetch!(FRESH_DATA); });

    await waitFor(() => expect(result.current.data).toEqual(FRESH_DATA));
  });

  it("expose une fonction revalidate() appelable manuellement", async () => {
    const KEY = "test:revalidate-manual";
    const INITIAL = { version: 1 };
    const UPDATED = { version: 2 };

    const fetcher = vi.fn()
      .mockResolvedValueOnce(INITIAL)
      .mockResolvedValueOnce(UPDATED);

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(INITIAL);

    // Forcer une revalidation manuelle
    await act(async () => { await result.current.revalidate(); });

    expect(result.current.data).toEqual(UPDATED);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PERSISTENCE sessionStorage — [PHASE RED]
// Ces tests DOIVENT ÉCHOUER en phase Red (sessionStorage non implémenté)
// ─────────────────────────────────────────────────────────────────────────────

describe("useQueryCache — persistence sessionStorage [RED]", () => {
  it("écrit les données dans sessionStorage après un fetch réussi", async () => {
    const KEY = "test:persistence-write";
    const DATA = { id: 1, name: "Jean" };
    const fetcher = vi.fn().mockResolvedValue(DATA);

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher, { ttl: TTL_PROFILES })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // sessionStorage doit contenir "benchrs:qc:<key>"
    // ÉCHOUE en phase Red : l'implémentation actuelle n'écrit pas dans sessionStorage
    const raw = sessionStorage.getItem(`${SS_PREFIX}${KEY}`);
    expect(raw).not.toBeNull();

    const entry = JSON.parse(raw!);
    expect(entry.data).toEqual(DATA);
    expect(entry.expiresAt).toBeGreaterThan(Date.now());
  });

  it("restaure les données depuis sessionStorage lors du remount (loading=false immédiat)", () => {
    const KEY = "test:persistence-remount";
    const DATA = { id: 42, label: "persist-me" };

    // Simuler une entrée sessionStorage valide (comme après un premier montage)
    sessionStorage.setItem(
      `${SS_PREFIX}${KEY}`,
      JSON.stringify({ data: DATA, expiresAt: Date.now() + TTL_PROFILES })
    );

    const fetcher = vi.fn().mockResolvedValue({ id: 42, label: "refreshed" });

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher, { ttl: TTL_PROFILES })
    );

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // loading=false dès le premier render synchrone (données restaurées depuis SS)
    // ÉCHOUE en phase Red : l'impl commence toujours avec loading=true
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual(DATA);
  });

  it("data stale disponible immédiatement depuis sessionStorage avant le refetch", async () => {
    const KEY = "test:persistence-stale-immediate";
    const STALE_DATA = { season: 2024, goals: 10 };
    const FRESH_DATA = { season: 2024, goals: 12 };

    sessionStorage.setItem(
      `${SS_PREFIX}${KEY}`,
      JSON.stringify({ data: STALE_DATA, expiresAt: Date.now() + TTL_EVENTS })
    );

    let resolveRefetch!: (v: typeof FRESH_DATA) => void;
    const fetcher = vi.fn(
      () => new Promise<typeof FRESH_DATA>((r) => { resolveRefetch = r; })
    );

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher, { ttl: TTL_EVENTS })
    );

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // data (stale) visible AVANT que le refetch ne complète
    // ÉCHOUE en phase Red : data=null car pas de restauration SS
    expect(result.current.data).toEqual(STALE_DATA);

    // Résolution du refetch : données fraîches remplacent le stale
    await act(async () => { resolveRefetch!(FRESH_DATA); });

    await waitFor(() => expect(result.current.data).toEqual(FRESH_DATA));
  });

  it("ignore les entrées sessionStorage expirées et re-fetche", async () => {
    const KEY = "test:persistence-expired-ss";
    const EXPIRED_DATA = { stale: true };
    const FRESH_DATA = { stale: false };

    // Entrée sessionStorage expirée (1 seconde dans le passé)
    sessionStorage.setItem(
      `${SS_PREFIX}${KEY}`,
      JSON.stringify({ data: EXPIRED_DATA, expiresAt: Date.now() - 1_000 })
    );

    const fetcher = vi.fn().mockResolvedValue(FRESH_DATA);

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher)
    );

    // SS expiré → loading=true car on doit re-fetcher
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Les données fraîches (pas les données expirées) doivent être retournées
    expect(result.current.data).toEqual(FRESH_DATA);
    expect(result.current.data).not.toEqual(EXPIRED_DATA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TTL DIFFÉRENCIÉS — profiles=5min, events=1min, realtime=30s
// Tests mixtes : TTL purs avec fake timers (getQueryCache/setQueryCache)
// ─────────────────────────────────────────────────────────────────────────────

describe("queryCache — TTL différenciés", () => {
  it("DEFAULT_TTL est de 30 secondes", () => {
    expect(DEFAULT_TTL).toBe(TTL_REALTIME);
  });

  it("les constantes TTL_PROFILES, TTL_EVENTS, TTL_REALTIME sont exportées avec les bonnes valeurs", async () => {
    const mod = await import("@/lib/queryCache");

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // Ces constantes doivent être exportées par queryCache.ts
    // ÉCHOUE en phase Red si les exports n'existent pas
    expect((mod as Record<string, unknown>).TTL_PROFILES).toBe(TTL_PROFILES); // 300_000ms = 5min
    expect((mod as Record<string, unknown>).TTL_EVENTS).toBe(TTL_EVENTS);     // 60_000ms  = 1min
    expect((mod as Record<string, unknown>).TTL_REALTIME).toBe(TTL_REALTIME); // 30_000ms  = 30s
  });

  it("setQueryCache avec TTL_PROFILES : entrée valide 5min, expirée 1ms après", () => {
    vi.useFakeTimers();
    const KEY = "test:ttl-profiles";
    const DATA = { teamId: "team-1", members: 12 };

    setQueryCache(KEY, DATA, TTL_PROFILES);
    expect(getQueryCache(KEY).has).toBe(true);

    // 4min59.999s → toujours valide
    vi.advanceTimersByTime(TTL_PROFILES - 1);
    expect(getQueryCache(KEY).has).toBe(true);

    // 5min0.001s → expiré
    vi.advanceTimersByTime(2);
    expect(getQueryCache(KEY).has).toBe(false);
  });

  it("setQueryCache avec TTL_EVENTS : entrée valide 1min, expirée après", () => {
    vi.useFakeTimers();
    const KEY = "test:ttl-events";
    const DATA = { eventId: "event-42" };

    setQueryCache(KEY, DATA, TTL_EVENTS);
    expect(getQueryCache(KEY).has).toBe(true);

    vi.advanceTimersByTime(TTL_EVENTS - 1);
    expect(getQueryCache(KEY).has).toBe(true);

    vi.advanceTimersByTime(2);
    expect(getQueryCache(KEY).has).toBe(false);
  });

  it("setQueryCache avec TTL_REALTIME (30s) : comporte comme DEFAULT_TTL", () => {
    vi.useFakeTimers();
    const KEY = "test:ttl-realtime";
    const DATA = { liveScore: "2-1" };

    setQueryCache(KEY, DATA, TTL_REALTIME);
    expect(getQueryCache(KEY).has).toBe(true);

    vi.advanceTimersByTime(TTL_REALTIME - 1);
    expect(getQueryCache(KEY).has).toBe(true);

    vi.advanceTimersByTime(2);
    expect(getQueryCache(KEY).has).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GESTION D'ERREUR — cache 5s, pas de retry storm
// ─────────────────────────────────────────────────────────────────────────────

describe("useQueryCache — gestion d'erreur", () => {
  it("si le fetch échoue, data reste null et loading passe à false", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useQueryCache("test:fetch-error", fetcher)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBeNull();
  });

  it("key=null ne déclenche aucun fetch et data reste null", async () => {
    // Quand key=null, le hook ne doit pas appeler le fetcher.
    // Note : l'implémentation actuelle laisse loading=true quand key=null
    // (car !cached.has → !false = true). C'est un comportement acceptable
    // pour le cas key=null (la query est "désactivée").
    const fetcher = vi.fn();

    const { result } = renderHook(() =>
      useQueryCache(null, fetcher)
    );

    // Petite attente pour laisser les effets potentiels se propager
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 50));
    });

    // Le fetcher ne doit pas avoir été appelé (key absente = query désactivée)
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("un fetch échoué ne déclenche pas de retry immédiat (protection retry storm)", async () => {
    // Ce test vérifie qu'après un échec, aucun retry automatique ne se produit
    // dans la fenêtre de TTL erreur (5s).
    // On utilise une clé unique pour éviter toute interférence avec le cache.
    const KEY = `test:no-retry-storm-${Date.now()}`;
    const fetcher = vi.fn().mockRejectedValue(new Error("Persistent error"));

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Vérifier qu'un seul appel a eu lieu (le fetch initial)
    const callCountAfterFirstFetch = fetcher.mock.calls.length;
    expect(callCountAfterFirstFetch).toBe(1);

    // Attendre 200ms supplémentaires — aucun retry ne doit se produire
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 200));
    });

    // Le nombre d'appels ne doit pas avoir augmenté
    expect(fetcher).toHaveBeenCalledTimes(callCountAfterFirstFetch);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. STALE-WHILE-REVALIDATE — isRevalidating [PHASE RED]
// Ces tests DOIVENT ÉCHOUER en phase Red (isRevalidating non implémenté)
// ─────────────────────────────────────────────────────────────────────────────

describe("useQueryCache — stale-while-revalidate [RED]", () => {
  it("expose isRevalidating=true pendant le refetch en background", async () => {
    const KEY = "test:swr-revalidating";
    const STALE_DATA = { value: 1 };
    const FRESH_DATA = { value: 2 };

    // Pré-peupler le cache mémoire avec données stale
    setQueryCache(KEY, STALE_DATA, TTL_EVENTS);

    let resolveRefetch!: (v: typeof FRESH_DATA) => void;
    const fetcher = vi.fn(
      () => new Promise<typeof FRESH_DATA>((r) => { resolveRefetch = r; })
    );

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher, { ttl: TTL_EVENTS })
    );

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // Pendant le refetch : data stale disponible + isRevalidating=true
    // ÉCHOUE en phase Red : isRevalidating n'est pas dans l'API actuelle
    expect(result.current.data).toEqual(STALE_DATA);
    expect(result.current.isRevalidating).toBe(true);

    // Après résolution
    await act(async () => { resolveRefetch!(FRESH_DATA); });

    await waitFor(() => expect(result.current.data).toEqual(FRESH_DATA));
    expect(result.current.isRevalidating).toBe(false);
  });

  it("isRevalidating=false quand le cache est frais et aucun fetch n'est en cours", async () => {
    const KEY = "test:swr-not-revalidating";
    const DATA = { fresh: true };
    const fetcher = vi.fn().mockResolvedValue(DATA);

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // Après fetch initial réussi, plus de revalidation en cours
    // ÉCHOUE en phase Red : isRevalidating n'existe pas
    expect(result.current.isRevalidating).toBe(false);
  });

  it("loading=false + isRevalidating=true avec données stale depuis sessionStorage [RED]", async () => {
    const KEY = "test:swr-from-ss";
    const STALE_DATA = { attendance: 80 };

    // Simuler données stale en sessionStorage
    sessionStorage.setItem(
      `${SS_PREFIX}${KEY}`,
      JSON.stringify({ data: STALE_DATA, expiresAt: Date.now() + TTL_EVENTS })
    );

    let resolveRefetch!: (v: typeof STALE_DATA) => void;
    const fetcher = vi.fn(
      () => new Promise<typeof STALE_DATA>((r) => { resolveRefetch = r; })
    );

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher, { ttl: TTL_EVENTS })
    );

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION (double feature : SS + isRevalidating) :
    // - loading=false : données stale restaurées depuis sessionStorage
    // - isRevalidating=true : refetch en background lancé
    // ÉCHOUE en phase Red (deux raisons : pas de SS + pas de isRevalidating)
    expect(result.current.loading).toBe(false);
    expect(result.current.isRevalidating).toBe(true);
    expect(result.current.data).toEqual(STALE_DATA);

    // Cleanup
    await act(async () => { resolveRefetch!(STALE_DATA); });
  });

  it("revalidate() manuelle expose isRevalidating=true puis false", async () => {
    const KEY = "test:swr-manual-revalidate";
    const INITIAL = { count: 5 };
    const UPDATED = { count: 7 };

    let resolveSecondFetch!: (v: typeof UPDATED) => void;

    const fetcher = vi.fn()
      .mockResolvedValueOnce(INITIAL)
      .mockImplementationOnce(
        () => new Promise<typeof UPDATED>((r) => { resolveSecondFetch = r; })
      );

    const { result } = renderHook(() =>
      useQueryCache(KEY, fetcher)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(INITIAL);

    // Déclencher revalidation manuelle (non-awaited pour observer isRevalidating en cours)
    act(() => { result.current.revalidate(); });

    // COMPORTEMENT ATTENDU APRÈS OPTIMISATION :
    // isRevalidating=true immédiatement après appel de revalidate()
    // ÉCHOUE en phase Red
    expect(result.current.isRevalidating).toBe(true);

    await act(async () => { resolveSecondFetch!(UPDATED); });

    await waitFor(() => expect(result.current.data).toEqual(UPDATED));
    expect(result.current.isRevalidating).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. API UTILITAIRES — getQueryCache / setQueryCache / clearQueryCache
// ─────────────────────────────────────────────────────────────────────────────

describe("queryCache — API utilitaires", () => {
  it("getQueryCache retourne {has:false, data:null} pour une clé inconnue", () => {
    const result = getQueryCache("inexistant-key-xyz-abc");
    expect(result.has).toBe(false);
    expect(result.data).toBeNull();
  });

  it("setQueryCache puis getQueryCache retourne les données correctes", () => {
    const KEY = "util:set-get";
    const DATA = { x: 42 };
    setQueryCache(KEY, DATA);
    const result = getQueryCache(KEY);
    expect(result.has).toBe(true);
    expect(result.data).toEqual(DATA);
  });

  it("clearQueryCache() sans argument vide tout le cache", () => {
    setQueryCache("util:clear-a", { a: 1 });
    setQueryCache("util:clear-b", { b: 2 });
    clearQueryCache();
    expect(getQueryCache("util:clear-a").has).toBe(false);
    expect(getQueryCache("util:clear-b").has).toBe(false);
  });

  it("clearQueryCache(key) supprime uniquement la clé ciblée", () => {
    setQueryCache("util:selective-a", { a: 1 });
    setQueryCache("util:selective-b", { b: 2 });
    clearQueryCache("util:selective-a");
    expect(getQueryCache("util:selective-a").has).toBe(false);
    expect(getQueryCache("util:selective-b").has).toBe(true);
  });

  it("deux hooks sur la même clé partagent le cache (pas de double fetch en vol)", async () => {
    const KEY = "util:shared-cache";
    const DATA = { source: "a" };

    // Bloquer le premier fetch pour observer la déduplication inFlight
    let resolveFetch!: (v: typeof DATA) => void;
    const fetcher = vi.fn(
      () => new Promise<typeof DATA>((r) => { resolveFetch = r; })
    );

    const { result: r1 } = renderHook(() => useQueryCache(KEY, fetcher));
    const { result: r2 } = renderHook(() => useQueryCache(KEY, fetcher));

    // Les deux hooks en vol → un seul fetch doit être en cours
    expect(fetcher).toHaveBeenCalledOnce();

    await act(async () => { resolveFetch!(DATA); });

    await waitFor(() => {
      expect(r1.current.loading).toBe(false);
      expect(r2.current.loading).toBe(false);
    });

    // Même données sur les deux hooks
    expect(r1.current.data).toEqual(DATA);
    expect(r2.current.data).toEqual(DATA);
  });
});
