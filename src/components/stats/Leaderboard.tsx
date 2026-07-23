"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Shield, Clock, Target, Users } from "lucide-react";

interface LeaderboardEntry {
  player_id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played: number;
  matches_played: number;
  attendance_rate: number;
}

type SortKey = "goals" | "assists" | "yellow_cards" | "red_cards" | "minutes_played" | "attendance_rate";

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchLeaderboard() {
      const { data: statsData } = await supabase.from("match_stats").select(`
        player_id, goals, assists, yellow_cards, red_cards, minutes_played,
        player:profiles!match_stats_player_id_fkey(id, first_name, last_name, shirt_number)
      `);

      if (!statsData) {
        setLoading(false);
        return;
      }

      const playerMap = new Map<string, LeaderboardEntry>();

      for (const stat of statsData) {
        const pid = stat.player_id as string;
        const player = stat.player as unknown as { id: string; first_name: string; last_name: string; shirt_number: number | null };
        if (!player) continue;

        if (!playerMap.has(pid)) {
          playerMap.set(pid, {
            player_id: pid,
            first_name: player.first_name,
            last_name: player.last_name,
            shirt_number: player.shirt_number,
            goals: 0, assists: 0, yellow_cards: 0, red_cards: 0,
            minutes_played: 0, matches_played: 0, attendance_rate: 0,
          });
        }

        const entry = playerMap.get(pid)!;
        entry.goals += (stat.goals as number) || 0;
        entry.assists += (stat.assists as number) || 0;
        entry.yellow_cards += (stat.yellow_cards as number) || 0;
        entry.red_cards += (stat.red_cards as number) || 0;
        entry.minutes_played += (stat.minutes_played as number) || 0;
        entry.matches_played += 1;
      }

      // Fetch attendance rates (trainings only)
      const { data: trainingEvents } = await supabase.from("events").select("id").eq("type", "training");
      const trainingIds = (trainingEvents || []).map((e) => e.id);
      const { data: attendanceData } = trainingIds.length > 0
        ? await supabase.from("attendances").select("user_id, status").in("event_id", trainingIds)
        : { data: [] };
      if (attendanceData) {
        const playerAtt = new Map<string, { total: number; present: number }>();
        for (const att of attendanceData) {
          const uid = att.user_id as string;
          if (!playerAtt.has(uid)) playerAtt.set(uid, { total: 0, present: 0 });
          const pa = playerAtt.get(uid)!;
          pa.total += 1;
          if (att.status === "present" || att.status === "late") pa.present += 1;
        }
        for (const [, entry] of playerMap) {
          const pa = playerAtt.get(entry.player_id);
          if (pa && pa.total > 0) entry.attendance_rate = Math.round((pa.present / pa.total) * 100);
        }
      }

      setData(Array.from(playerMap.values()));
      setLoading(false);
    }

    fetchLeaderboard();
  }, []);

  const sorted = [...data].sort((a, b) => b[sortKey] - a[sortKey]);

  const rankIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-5 w-5 text-[var(--color-gold)]" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm text-muted-foreground w-5 text-center">{index + 1}</span>;
  };

  const sortOptions: [SortKey, string, typeof Trophy][] = [
    ["goals", "Buteurs", Target],
    ["assists", "Passeurs", Target],
    ["yellow_cards", "Cartons", Shield],
    ["red_cards", "Rouges", Shield],
    ["minutes_played", "Temps", Clock],
    ["attendance_rate", "Assiduité", Users],
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {sortOptions.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              sortKey === key
                ? "bg-[var(--color-royal)] text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Joueur</TableHead>
              {sortKey === "goals" && <TableHead className="text-right">Buts</TableHead>}
              {sortKey === "assists" && <TableHead className="text-right">Passes</TableHead>}
              {sortKey === "yellow_cards" && <TableHead className="text-right">Jaunes</TableHead>}
              {sortKey === "red_cards" && <TableHead className="text-right">Rouges</TableHead>}
              {sortKey === "minutes_played" && <TableHead className="text-right">Minutes</TableHead>}
              {sortKey === "attendance_rate" && <TableHead className="text-right">Présence</TableHead>}
              <TableHead className="text-right">Matchs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((player, index) => (
              <TableRow key={player.player_id}>
                <TableCell>{rankIcon(index)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-xs font-bold">
                      {player.first_name[0]}{player.last_name[0]}
                    </div>
                    <div>
                      <p className="font-medium">{player.first_name} {player.last_name}</p>
                      {player.shirt_number && (
                        <p className="text-xs text-muted-foreground">#{player.shirt_number}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                {sortKey === "goals" && (
                  <TableCell className="text-right">
                    <Badge className="bg-[var(--color-gold)] text-[var(--color-navy)]">{player.goals}</Badge>
                  </TableCell>
                )}
                {sortKey === "assists" && (
                  <TableCell className="text-right">
                    <Badge className="bg-[var(--color-royal)] text-white">{player.assists}</Badge>
                  </TableCell>
                )}
                {sortKey === "yellow_cards" && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div className="h-3 w-2 rounded-sm bg-yellow-400" />
                      <span className="text-sm font-medium">{player.yellow_cards}</span>
                    </div>
                  </TableCell>
                )}
                {sortKey === "red_cards" && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <div className="h-3 w-2 rounded-sm bg-red-600" />
                      <span className="text-sm font-medium">{player.red_cards}</span>
                    </div>
                  </TableCell>
                )}
                {sortKey === "minutes_played" && (
                  <TableCell className="text-right">
                    <span className="text-sm font-medium">{player.minutes_played}&apos;</span>
                  </TableCell>
                )}
                {sortKey === "attendance_rate" && (
                  <TableCell className="text-right">
                    <Badge variant="secondary" className={
                      player.attendance_rate >= 80 ? "bg-green-100 text-green-700" :
                      player.attendance_rate >= 50 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }>
                      {player.attendance_rate}%
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="text-right text-muted-foreground">
                  {player.matches_played}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Aucune statistique disponible. Les données apparaissent après les premiers matchs.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
