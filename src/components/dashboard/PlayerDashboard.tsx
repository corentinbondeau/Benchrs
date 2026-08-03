"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { NextEventCard } from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Target, Clock, Trophy } from "lucide-react";

interface PlayerStats {
  attendanceRate: number;
  goals: number;
  assists: number;
  matchesPlayed: number;
}

export function PlayerDashboard() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const { data: stats, loading } = useQueryCache<PlayerStats>(
    user?.id && currentTeam ? `player:stats:${user.id}:${currentTeam.id}` : null,
    async () => {
      const supabase = createClient();
      const { data: trainingEvents } = await supabase
        .from("events")
        .select("id")
        .eq("team_id", currentTeam!.id)
        .eq("type", "training");
      const trainingIds = (trainingEvents || []).map((e) => e.id);

      const [attRes, statsRes] = await Promise.all([
        trainingIds.length > 0
          ? supabase
              .from("attendances")
              .select("status")
              .eq("user_id", user!.id)
              .eq("team_id", currentTeam!.id)
              .in("event_id", trainingIds)
          : Promise.resolve({ data: [] }),
        supabase
          .from("match_stats")
          .select("goals, assists, minutes_played")
          .eq("player_id", user!.id)
          .eq("team_id", currentTeam!.id),
      ]);

      const attendances = attRes.data || [];
      const total = attendances.length;
      const present = attendances.filter(
        (a) => a.status === "present" || a.status === "late"
      ).length;
      const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;

      const matchStats = statsRes.data || [];
      const goals = matchStats.reduce((sum, s) => sum + (s.goals || 0), 0);
      const assists = matchStats.reduce((sum, s) => sum + (s.assists || 0), 0);
      const matchesPlayed = matchStats.length;

      return { attendanceRate, goals, assists, matchesPlayed };
    },
    { ttl: 60_000 }
  );

  if (!currentTeam) return null;

  const statItems = stats
    ? [
        { icon: Clock, label: "Assiduité", value: `${stats.attendanceRate}%`, color: "text-[var(--color-royal)]", bg: "bg-blue-50" },
        { icon: Trophy, label: "Matchs joués", value: stats.matchesPlayed, color: "text-green-600", bg: "bg-green-50" },
        { icon: Target, label: "Buts", value: stats.goals, color: "text-[var(--color-gold)]", bg: "bg-amber-50" },
        { icon: TrendingUp, label: "Passes", value: stats.assists, color: "text-purple-600", bg: "bg-purple-50" },
      ]
    : [];

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xl font-bold">
          Bonjour, {user?.profile?.first_name} 👋
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Voici ton résumé
        </p>
      </div>

      <div className="px-4 space-y-4">
        <NextEventCard />

        {!loading && stats && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--color-royal)]" />
                Mes stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {statItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.bg}`}>
                      <item.icon className={`h-5 w-5 ${item.color}`} />
                    </div>
                    <div>
                      <p className="text-xl font-bold">{item.value}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <PendingConvocations />
        <RecentResults />
      </div>
    </div>
  );
}
