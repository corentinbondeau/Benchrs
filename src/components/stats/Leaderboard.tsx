"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { fetchTeamActivePlayers } from "@/lib/players";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Shield, Clock, Target, Users } from "lucide-react";
import {
  buildLeaderboard,
  type LeaderboardEntry,
  type RosterPlayer,
  type MatchStatRow,
  type AttendanceRow,
} from "@/lib/stats/buildLeaderboard";

type SortKey = "goals" | "assists" | "yellow_cards" | "red_cards" | "minutes_played" | "attendance_rate";

export function Leaderboard() {
  const { currentTeam } = useTeam();
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();

    async function fetchLeaderboard() {
      // Le roster (joueurs de l'équipe) est la source de vérité de la liste :
      // ainsi l'onglet Assiduité s'affiche même sans aucun match joué.
      // On réutilise le helper fiable (fetch en 2 étapes team_members → profiles) ;
      // une jointure imbriquée profiles(...) remontait vide selon la config RLS.
      const players = await fetchTeamActivePlayers(currentTeam!.id, ["player"]);
      const roster: RosterPlayer[] = players.map((p) => ({
        player_id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        shirt_number: p.shirt_number ?? null,
      }));

      const { data: statsData } = await supabase
        .from("match_stats")
        .select("player_id, goals, assists, yellow_cards, red_cards, minutes_played")
        .eq("team_id", currentTeam!.id);

      // Assiduité : présence aux entraînements uniquement (events.type='training').
      const { data: trainingEvents } = await supabase
        .from("events")
        .select("id")
        .eq("team_id", currentTeam!.id)
        .eq("type", "training")
        .neq("status", "cancelled")
        .lte("event_date", new Date().toISOString());
      const trainingIds = (trainingEvents || []).map((e) => e.id as string);
      const { data: attendanceData } = trainingIds.length > 0
        ? await supabase
            .from("attendances")
            .select("user_id, event_id, status")
            .eq("team_id", currentTeam!.id)
            .in("event_id", trainingIds)
        : { data: [] };

      setData(
        buildLeaderboard(
          roster,
          (statsData || []) as MatchStatRow[],
          (attendanceData || []) as AttendanceRow[],
          trainingIds
        )
      );
      setLoading(false);
    }

    fetchLeaderboard();
  }, [currentTeam]);

  if (!currentTeam) return null;

  const sorted = [...data].sort((a, b) => b[sortKey] - a[sortKey]);

  const emptyMessage =
    data.length === 0
      ? "Aucun joueur dans l'effectif."
      : sortKey === "attendance_rate"
        ? "Aucun entraînement enregistré."
        : "Aucune statistique de match. Les données apparaissent après les premiers matchs.";

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

  const statValue = (player: LeaderboardEntry) => {
    switch (sortKey) {
      case "goals": return { label: `${player.goals} buts`, badge: true, color: "bg-[var(--color-gold)] text-[var(--color-navy)]" };
      case "assists": return { label: `${player.assists} passes`, badge: true, color: "bg-[var(--color-royal)] text-white" };
      case "yellow_cards": return { label: `${player.yellow_cards} jaune${player.yellow_cards > 1 ? "s" : ""}`, badge: false, color: "" };
      case "red_cards": return { label: `${player.red_cards} rouge${player.red_cards > 1 ? "s" : ""}`, badge: false, color: "" };
      case "minutes_played": return { label: `${player.minutes_played}'`, badge: false, color: "" };
      case "attendance_rate": return { label: `${player.attendance_rate}%`, badge: true, color: player.attendance_rate >= 80 ? "bg-green-100 text-green-700" : player.attendance_rate >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700" };
    }
  };

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

      {/* Mobile: card list */}
      <div className="md:hidden space-y-2">
        {sorted.map((player, index) => {
          const sv = statValue(player);
          return (
            <div key={player.player_id} className="flex items-center gap-3 rounded-lg border px-4 py-3">
              <div className="flex-shrink-0 w-6 text-center">{rankIcon(index)}</div>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-xs font-bold shrink-0">
                  {player.first_name[0]}{player.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{player.first_name} {player.last_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {sortKey === "attendance_rate"
                      ? `${player.trainings_count} entraînement${player.trainings_count > 1 ? "s" : ""}`
                      : `${player.matches_played} match${player.matches_played > 1 ? "s" : ""}`}
                    {player.shirt_number && ` · #${player.shirt_number}`}
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                {sv.badge ? (
                  <Badge className={sv.color}>{sv.label}</Badge>
                ) : (
                  <span className="text-sm font-medium">{sv.label}</span>
                )}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-center py-8 text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border">
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
              <TableHead className="text-right">{sortKey === "attendance_rate" ? "Entraînements" : "Matchs"}</TableHead>
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
                  {sortKey === "attendance_rate" ? player.trainings_count : player.matches_played}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
