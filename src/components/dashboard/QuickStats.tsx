"use client";

import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { countTeamActivePlayers } from "@/lib/players";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, Trophy } from "lucide-react";

interface QuickStatsData {
  upcomingEvents: number;
  totalPlayers: number;
  recentWins: number;
}

export function QuickStats() {
  const { currentTeam } = useTeam();
  const { data: stats, loading } = useQueryCache<QuickStatsData>(
    currentTeam ? `stats:quick:${currentTeam.id}` : null,
    async () => {
      const supabase = createClient();
      const [eventsRes, playersCount, winsRes] = await Promise.all([
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("team_id", currentTeam!.id)
          .eq("status", "upcoming")
          .gte("event_date", new Date().toISOString()),
        countTeamActivePlayers(currentTeam!.id),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("team_id", currentTeam!.id)
          .eq("match_result", "win")
          .gte("event_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      return {
        upcomingEvents: eventsRes.count || 0,
        totalPlayers: playersCount,
        recentWins: winsRes.count || 0,
      };
    },
    { ttl: 60_000 }
  );

  if (!currentTeam) return null;

  if (loading || !stats) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const items = [
    { icon: Calendar, label: "Événements à venir", value: stats.upcomingEvents, color: "text-[var(--color-royal)]", bg: "bg-blue-50" },
    { icon: Users, label: "Joueurs actifs", value: stats.totalPlayers, color: "text-green-600", bg: "bg-green-50" },
    { icon: Trophy, label: "Victoires (30j)", value: stats.recentWins, color: "text-[var(--color-gold)]", bg: "bg-amber-50" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Aperçu rapide</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.bg}`}>
              <item.icon className={`h-5 w-5 ${item.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-xs text-muted-foreground">{item.label}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
