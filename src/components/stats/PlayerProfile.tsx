"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Target,
  Clock,
  CalendarCheck,
  Zap,
} from "lucide-react";

interface PlayerStats {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  shirt_number: number | null;
  total_goals: number;
  total_assists: number;
  matches_played: number;
  total_minutes: number;
  attendance_rate: number;
  yellow_cards: number;
  red_cards: number;
}

export function PlayerProfile({ playerId }: { playerId: string }) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchPlayerStats() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", playerId)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      const { data: matchStats } = await supabase
        .from("match_stats")
        .select("goals, assists, yellow_cards, red_cards, minutes_played, event_id")
        .eq("player_id", playerId);

      const { data: attendanceData } = await supabase
        .from("attendances")
        .select("status")
        .eq("user_id", playerId);

      let totalGoals = 0;
      let totalAssists = 0;
      let totalMinutes = 0;
      let yellowCards = 0;
      let redCards = 0;

      if (matchStats) {
        for (const s of matchStats) {
          totalGoals += (s.goals as number) || 0;
          totalAssists += (s.assists as number) || 0;
          totalMinutes += (s.minutes_played as number) || 0;
          yellowCards += (s.yellow_cards as number) || 0;
          redCards += (s.red_cards as number) || 0;
        }
      }

      let attendanceRate = 0;
      if (attendanceData && attendanceData.length > 0) {
        const present = attendanceData.filter(
          (a) => a.status === "present" || a.status === "late"
        ).length;
        attendanceRate = Math.round((present / attendanceData.length) * 100);
      }

      setStats({
        player_id: playerId,
        first_name: profile.first_name,
        last_name: profile.last_name,
        position: profile.position,
        shirt_number: profile.shirt_number,
        total_goals: totalGoals,
        total_assists: totalAssists,
        matches_played: matchStats?.length || 0,
        total_minutes: totalMinutes,
        attendance_rate: attendanceRate,
        yellow_cards: yellowCards,
        red_cards: redCards,
      });
      setLoading(false);
    }

    fetchPlayerStats();
  }, [playerId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    {
      icon: Trophy,
      label: "Buts",
      value: stats.total_goals,
      color: "text-[var(--gold)]",
      bg: "bg-amber-50",
    },
    {
      icon: Target,
      label: "Passes",
      value: stats.total_assists,
      color: "text-[var(--royal)]",
      bg: "bg-blue-50",
    },
    {
      icon: CalendarCheck,
      label: "Matchs",
      value: stats.matches_played,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      icon: Clock,
      label: "Minutes",
      value: stats.total_minutes,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      icon: Zap,
      label: "Présence",
      value: `${stats.attendance_rate}%`,
      color:
        stats.attendance_rate >= 80
          ? "text-green-600"
          : stats.attendance_rate >= 50
          ? "text-amber-600"
          : "text-red-600",
      bg:
        stats.attendance_rate >= 80
          ? "bg-green-50"
          : stats.attendance_rate >= 50
          ? "bg-amber-50"
          : "bg-red-50",
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-blue-900 to-blue-800 text-white">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-2xl font-bold">
              {stats.shirt_number || "?"}
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                {stats.first_name} {stats.last_name}
              </h2>
              <p className="text-blue-200 mt-1">{stats.position || "Joueur"}</p>
              <div className="flex gap-2 mt-2">
                {stats.yellow_cards > 0 && (
                  <Badge className="bg-yellow-400 text-yellow-900">
                    🟨 {stats.yellow_cards}
                  </Badge>
                )}
                {stats.red_cards > 0 && (
                  <Badge className="bg-red-500 text-white">
                    🟥 {stats.red_cards}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg} mx-auto mb-2`}
              >
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
