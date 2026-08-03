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
  cache.set(key, { data, expiresAt: Date.now() + ttl });
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
  revalidate: () => Promise<void>;
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
  }>(() => {
    const cached = key ? getQueryCache<T>(key) : { has: false, data: null };
    return { queryKey: key, data: cached.data, loading: !cached.has };
  });

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

  const revalidate = useCallback(async () => {
    const k = keyRef.current;
    if (!k) return;
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
      setSnapshot({ queryKey: k, data: result as T, loading: false });
    } catch {
      setSnapshot((s) => ({ ...s, loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!key) return;
    const unsub = subscribe(key, () => {
      const updated = getQueryCache<T>(key);
      if (updated.has) {
        setSnapshot({ queryKey: key, data: updated.data, loading: false });
      }
    });
    revalidate();
    return unsub;
  }, [key, revalidate]);

  return { data, loading, revalidate };
}
