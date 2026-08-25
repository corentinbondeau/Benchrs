"use client";

import { memo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { countTeamActivePlayers } from "@/lib/players";
import { Calendar, Users, Trophy } from "lucide-react";

interface QuickStatsData {
  upcomingEvents: number;
  totalPlayers: number;
  recentWins: number;
}

function QuickStats() {
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
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="h-12 animate-pulse rounded-lg bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  const items = [
    {
      icon: Calendar,
      label: "A venir",
      value: stats.upcomingEvents,
      iconColor: "text-[var(--color-primary-blue)]",
      iconBg: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
      icon: Users,
      label: "Joueurs",
      value: stats.totalPlayers,
      iconColor: "text-[var(--color-success)]",
      iconBg: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      icon: Trophy,
      label: "Victoires",
      sublabel: "30 jours",
      value: stats.recentWins,
      iconColor: "text-[var(--color-gold)]",
      iconBg: "bg-amber-50 dark:bg-amber-950/30",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-4">
          <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${item.iconBg} mb-3`}>
            <item.icon className={`h-[18px] w-[18px] ${item.iconColor}`} />
          </div>
          <p className="text-2xl font-bold tabular-nums">{item.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
          {item.sublabel && (
            <p className="text-[10px] text-muted-foreground/60">{item.sublabel}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default memo(QuickStats);
