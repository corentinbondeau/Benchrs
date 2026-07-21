"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PlayerCard } from "./PlayerCard";
import type { Profile } from "@/types";

interface PlayerWithStats extends Profile {
  goals: number;
  matches: number;
  attendanceRate: number;
}

export function RosterGrid() {
  const [players, setPlayers] = useState<PlayerWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchRoster() {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .eq("is_active", true)
        .order("shirt_number", { ascending: true, nullsFirst: false })
        .order("last_name", { ascending: true });

      if (!profiles) {
        setLoading(false);
        return;
      }

      const playerIds = profiles.map((p) => p.id);

      const [statsRes, attRes] = await Promise.all([
        supabase
          .from("match_stats")
          .select("player_id, goals, event_id")
          .in("player_id", playerIds),
        supabase
          .from("attendances")
          .select("user_id, status")
          .in("user_id", playerIds),
      ]);

      const goalsMap = new Map<string, number>();
      const matchMap = new Map<string, Set<string>>();
      (statsRes.data || []).forEach((s) => {
        goalsMap.set(s.player_id, (goalsMap.get(s.player_id) || 0) + s.goals);
        if (!matchMap.has(s.player_id)) matchMap.set(s.player_id, new Set());
        matchMap.get(s.player_id)!.add(s.event_id);
      });

      const attCountMap = new Map<string, { total: number; present: number }>();
      (attRes.data || []).forEach((a) => {
        const cur = attCountMap.get(a.user_id) || { total: 0, present: 0 };
        cur.total++;
        if (a.status === "present" || a.status === "late") cur.present++;
        attCountMap.set(a.user_id, cur);
      });

      const enriched: PlayerWithStats[] = profiles.map((p) => {
        const att = attCountMap.get(p.id);
        return {
          ...p,
          goals: goalsMap.get(p.id) || 0,
          matches: matchMap.get(p.id)?.size || 0,
          attendanceRate: att
            ? Math.round((att.present / att.total) * 100)
            : 0,
        };
      });

      setPlayers(enriched);
      setLoading(false);
    }

    fetchRoster();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        <p className="text-sm">Aucun joueur dans l&apos;effectif</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} stats={player} />
      ))}
    </div>
  );
}
