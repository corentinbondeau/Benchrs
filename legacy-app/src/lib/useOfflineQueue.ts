"use client";
import { useEffect, useCallback } from "react";

const QUEUE_KEY = "benchrs:offline-queue";

interface QueueItem {
  table: string;
  operation: "update" | "insert";
  data: Record<string, unknown>;
  filter?: Record<string, unknown>;
  timestamp: number;
}

export function enqueueOffline(item: Omit<QueueItem, "timestamp">) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as QueueItem[];
  queue.push({ ...item, timestamp: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function useOfflineSync() {
  const sync = useCallback(async () => {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as QueueItem[];
    if (queue.length === 0) return;

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const remaining: QueueItem[] = [];

    for (const item of queue) {
      try {
        if (item.operation === "update" && item.filter) {
          let q = supabase.from(item.table).update(item.data);
          for (const [k, v] of Object.entries(item.filter)) {
            q = q.eq(k, v as string);
          }
          await q;
        } else if (item.operation === "insert") {
          await supabase.from(item.table).insert(item.data);
        }
      } catch {
        remaining.push(item);
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  }, []);

  useEffect(() => {
    // Sync au retour en ligne
    window.addEventListener("online", sync);
    // Sync au montage si en ligne
    if (navigator.onLine) sync();
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  return {
    sync,
    pendingCount:
      typeof window !== "undefined"
        ? (JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as QueueItem[]).length
        : 0,
  };
}
