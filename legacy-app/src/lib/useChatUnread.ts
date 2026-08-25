"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureChatMemberships } from "@/lib/chat";

export interface UnreadCounts {
  counts: Record<string, number>;
  total: number;
}

/**
 * Compteurs de messages non lus par canal + total (badges navbar).
 * Garantit les membreships implicites puis interroge get_unread_chat_counts.
 */
export function useChatUnread(
  teamId: string | null | undefined,
  userId: string | undefined,
  role: string | undefined
): UnreadCounts {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const instanceId = useId();

  useEffect(() => {
    if (!teamId || !userId) return;
    const team = teamId;
    const me = userId;
    let cancelled = false;
    const supabase = createClient();

    async function refresh() {
      try {
        if (role) await ensureChatMemberships(team, me, role);
      } catch {
        // silencieux : le badge ne doit jamais casser la page
      }
      const { data } = await supabase.rpc("get_unread_chat_counts", {
        p_team_id: team,
      });
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const r of (data || []) as { channel_id: string; unread: number }[]) {
        map[r.channel_id] = Number(r.unread) || 0;
      }
      setCounts(map);
    }

    refresh();

    const channel = supabase
      .channel(`chat-unread:${team}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `team_id=eq.${teamId}`,
        },
        () => refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_members",
          filter: `user_id=eq.${me}`,
        },
        () => refresh()
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "chat_channels",
          filter: `team_id=eq.${teamId}`,
        },
        () => refresh()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [teamId, userId, role]);

  const total = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + n, 0),
    [counts]
  );

  return { counts, total };
}
