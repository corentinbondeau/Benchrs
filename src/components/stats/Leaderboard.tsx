"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Award } from "lucide-react";

interface LeaderboardEntry {
  player_id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  avatar_url: string | null;
  goals: number;
  assists: number;
  matches_played: number;
  minutes_played: number;
  attendance_rate: number;
}

type SortKey = "goals" | "assists" | "attendance_rate";

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchLeaderboard() {
      const { data: statsData } = await supabase.from("match_stats").select(`
        player_id,
        goals,
        assists,
        event_id,
        player:profiles!match_stats_player_id_fkey(id, first_name, last_name, shirt_number, avatar_url)
      `);

      if (!statsData) {
        setLoading(false);
        return;
      }

      const playerMap = new Map<string, LeaderboardEntry>();

      for (const stat of statsData) {
        const pid = stat.player_id as string;
        const player = stat.player as unknown as {
          id: string;
          first_name: string;
          last_name: string;
          shirt_number: number | null;
          avatar_url: string | null;
        };

        if (!player) continue;

        if (!playerMap.has(pid)) {
          playerMap.set(pid, {
            player_id: pid,
            first_name: player.first_name,
            last_name: player.last_name,
            shirt_number: player.shirt_number,
            avatar_url: player.avatar_url,
            goals: 0,
            assists: 0,
            matches_played: 0,
            minutes_played: 0,
            attendance_rate: 0,
          });
        }

        const entry = playerMap.get(pid)!;
        entry.goals += (stat.goals as number) || 0;
        entry.assists += (stat.assists as number) || 0;
        entry.matches_played += 1;
      }

      const { data: attendanceData } = await supabase
        .from("attendances")
        .select("user_id, status");

      if (attendanceData) {
        const playerAttendance = new Map<
          string,
          { total: number; present: number }
        >();

        for (const att of attendanceData) {
          const uid = att.user_id as string;
          if (!playerAttendance.has(uid)) {
            playerAttendance.set(uid, { total: 0, present: 0 });
          }
          const pa = playerAttendance.get(uid)!;
          pa.total += 1;
          if (att.status === "present" || att.status === "late") {
            pa.present += 1;
          }
        }

        for (const [, entry] of playerMap) {
          const pa = playerAttendance.get(entry.player_id);
          if (pa && pa.total > 0) {
            entry.attendance_rate = Math.round((pa.present / pa.total) * 100);
          }
        }
      }

      setData(Array.from(playerMap.values()));
      setLoading(false);
    }

    fetchLeaderboard();
  }, []);

  const sorted = [...data].sort((a, b) => b[sortKey] - a[sortKey]);

  const rankIcon = (index: number) => {
    if (index === 0)
      return <Trophy className="h-5 w-5 text-[var(--gold)]" />;
    if (index === 1) return <Medal className="h-5 w-5 text-gray-400" />;
    if (index === 2) return <Medal className="h-5 w-5 text-amber-600" />;
    return <span className="text-sm text-muted-foreground w-5 text-center">{index + 1}</span>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([["goals", "Buteurs"], ["assists", "Passeurs"], ["attendance_rate", "Assiduité"]] as const).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                sortKey === key
                  ? "bg-[var(--royal)] text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          )
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Joueur</TableHead>
              {sortKey === "goals" && <TableHead className="text-right">Buts</TableHead>}
              {sortKey === "assists" && <TableHead className="text-right">Passes</TableHead>}
              {sortKey === "attendance_rate" && (
                <TableHead className="text-right">Présence</TableHead>
              )}
              <TableHead className="text-right">Matchs</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((player, index) => (
              <TableRow key={player.player_id}>
                <TableCell>{rankIcon(index)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold">
                      {player.first_name[0]}
                      {player.last_name[0]}
                    </div>
                    <div>
                      <p className="font-medium">
                        {player.first_name} {player.last_name}
                      </p>
                      {player.shirt_number && (
                        <p className="text-xs text-muted-foreground">
                          #{player.shirt_number}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                {sortKey === "goals" && (
                  <TableCell className="text-right">
                    <Badge className="bg-[var(--gold)] text-[var(--gold-foreground)]">
                      {player.goals}
                    </Badge>
                  </TableCell>
                )}
                {sortKey === "assists" && (
                  <TableCell className="text-right">
                    <Badge className="bg-[var(--royal)] text-[var(--royal-foreground)]">
                      {player.assists}
                    </Badge>
                  </TableCell>
                )}
                {sortKey === "attendance_rate" && (
                  <TableCell className="text-right">
                    <Badge
                      variant="secondary"
                      className={
                        player.attendance_rate >= 80
                          ? "bg-green-100 text-green-700"
                          : player.attendance_rate >= 50
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                      }
                    >
                      {player.attendance_rate}%
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="text-right text-muted-foreground">
                  {player.matches_played}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
