"use client";

import { useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
export function useRealtime(
  table: string,
  filter: string | null,
  onInsert?: (payload: unknown) => void,
  onUpdate?: (payload: unknown) => void,
  onDelete?: (payload: unknown) => void
) {
  const subscribe = useCallback(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table, filter: filter || undefined },
        (payload) => onInsert?.(payload)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: filter || undefined },
        (payload) => onUpdate?.(payload)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table, filter: filter || undefined },
        (payload) => onDelete?.(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, onInsert, onUpdate, onDelete]);

  useEffect(() => {
    const cleanup = subscribe();
    return cleanup;
  }, [subscribe]);
}
