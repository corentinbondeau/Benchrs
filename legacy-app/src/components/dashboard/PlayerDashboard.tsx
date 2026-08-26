"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import NextEventCard from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import { NextSessionCheckIn } from "@/components/dashboard/NextSessionCheckIn";
import { LastSessionFeedback } from "@/components/dashboard/LastSessionFeedback";
import RecentResults from "@/components/dashboard/RecentResults";
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

  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const statItems = stats
    ? [
        { icon: Clock, label: "Assiduite", value: `${stats.attendanceRate}%`, iconColor: "text-[var(--color-primary-blue)]", iconBg: "bg-blue-50 dark:bg-blue-950/30" },
        { icon: Trophy, label: "Matchs joues", value: stats.matchesPlayed, iconColor: "text-[var(--color-success)]", iconBg: "bg-emerald-50 dark:bg-emerald-950/30" },
        { icon: Target, label: "Buts", value: stats.goals, iconColor: "text-[var(--color-gold)]", iconBg: "bg-amber-50 dark:bg-amber-950/30" },
        { icon: TrendingUp, label: "Passes D.", value: stats.assists, iconColor: "text-purple-600", iconBg: "bg-purple-50 dark:bg-purple-950/30" },
      ]
    : [];

  return (
    <div className="section-gap">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          Bonjour {user?.profile?.first_name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">{dateStr}</p>
      </div>

      {/* P0: Next event */}
      <NextEventCard />

      {/* P0: Pending convocations */}
      <PendingConvocations />

      {/* P1: Check-in de forme pour la prochaine séance */}
      <NextSessionCheckIn />

      {/* P1: RPE + feedback of the last past training session */}
      <LastSessionFeedback />

      {/* P1: My stats */}
      {!loading && stats && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Mes statistiques
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {statItems.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-card p-4">
                <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${item.iconBg} mb-3`}>
                  <item.icon className={`h-[18px] w-[18px] ${item.iconColor}`} />
                </div>
                <p className="text-2xl font-bold tabular-nums">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* P2: Recent results */}
      <RecentResults />
    </div>
  );
}
