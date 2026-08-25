"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();
const subscribers = new Map<string, Set<() => void>>();

export const DEFAULT_TTL = 30_000;
export const TTL_PROFILES = 300_000;
export const TTL_EVENTS = 60_000;
export const TTL_REALTIME = 30_000;

const SS_PREFIX = "benchrs:qc:";

function getFromSessionStorage<T>(key: string): { has: boolean; data: T | null } {
  try {
    const raw = sessionStorage.getItem(`${SS_PREFIX}${key}`);
    if (!raw) return { has: false, data: null };
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() > entry.expiresAt) {
      sessionStorage.removeItem(`${SS_PREFIX}${key}`);
      return { has: false, data: null };
    }
    return { has: true, data: entry.data };
  } catch {
    return { has: false, data: null };
  }
}

function writeToSessionStorage<T>(key: string, data: T, expiresAt: number) {
  try {
    sessionStorage.setItem(`${SS_PREFIX}${key}`, JSON.stringify({ data, expiresAt }));
  } catch {
    // sessionStorage indisponible (SSR, private browsing quota) → on ignore
  }
}

function subscribe(key: string, fn: () => void) {
  let set = subscribers.get(key);
  if (!set) {
    set = new Set();
    subscribers.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) subscribers.delete(key);
  };
}

function publish(key: string) {
  const set = subscribers.get(key);
  if (!set) return;
  for (const fn of set) fn();
}

export function getQueryCache<T>(key: string): { has: boolean; data: T | null } {
  const entry = cache.get(key);
  if (!entry) return { has: false, data: null };
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return { has: false, data: null };
  }
  return { has: true, data: entry.data as T };
}

export function setQueryCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL) {
  const expiresAt = Date.now() + ttl;
  cache.set(key, { data, expiresAt });
  writeToSessionStorage(key, data, expiresAt);
  publish(key);
}

export function clearQueryCache(key?: string) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  isRevalidating: boolean;
  revalidate: () => Promise<void>;
}

function getInitialSnapshot<T>(key: string | null): {
  queryKey: string | null;
  data: T | null;
  loading: boolean;
  isRevalidating: boolean;
} {
  if (!key) {
    return { queryKey: null, data: null, loading: true, isRevalidating: false };
  }

  // 1. Vérifier le cache mémoire
  const memCached = getQueryCache<T>(key);
  if (memCached.has) {
    return { queryKey: key, data: memCached.data, loading: false, isRevalidating: true };
  }

  // 2. Vérifier sessionStorage
  const ssCached = getFromSessionStorage<T>(key);
  if (ssCached.has) {
    return { queryKey: key, data: ssCached.data, loading: false, isRevalidating: true };
  }

  // 3. Rien en cache → premier fetch
  return { queryKey: key, data: null, loading: true, isRevalidating: false };
}

export function useQueryCache<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: { ttl?: number }
): QueryResult<T> {
  const ttl = options?.ttl ?? DEFAULT_TTL;
  const [snapshot, setSnapshot] = useState<{
    queryKey: string | null;
    data: T | null;
    loading: boolean;
    isRevalidating: boolean;
  }>(() => getInitialSnapshot<T>(key));

  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(key);
  const ttlRef = useRef(ttl);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  useEffect(() => {
    keyRef.current = key;
  }, [key]);
  useEffect(() => {
    ttlRef.current = ttl;
  }, [ttl]);

  const stale = snapshot.queryKey !== key;
  const data = stale ? null : snapshot.data;
  const loading = stale || snapshot.loading;
  const isRevalidating = stale ? false : snapshot.isRevalidating;

  const revalidate = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return;

    // Marquer la revalidation en cours si des données existent déjà
    setSnapshot((s) => {
      if (s.data !== null && !s.loading) {
        return { ...s, isRevalidating: true };
      }
      return s;
    });

    let p = inFlight.get(k);
    if (!p) {
      p = fetcherRef.current().then((result) => {
        setQueryCache(k, result, ttlRef.current);
        return result;
      });
      inFlight.set(k, p);
      p.then(
        () => inFlight.delete(k),
        () => inFlight.delete(k)
      );
    }
    try {
      const result = await p;
      setSnapshot({ queryKey: k, data: result as T, loading: false, isRevalidating: false });
    } catch {
      setSnapshot((s) => ({ ...s, loading: false, isRevalidating: false }));
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    const unsub = subscribe(key, () => {
      const updated = getQueryCache<T>(key);
      if (updated.has) {
        setSnapshot({ queryKey: key, data: updated.data, loading: false, isRevalidating: false });
      }
    });
    revalidate();
    return unsub;
  }, [key, revalidate]);

  return { data, loading, isRevalidating, revalidate };
}
