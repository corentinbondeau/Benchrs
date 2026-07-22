"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Target, Calendar, Star } from "lucide-react";

interface PlayerStatsProps {
  showChild?: boolean;
}

export function PlayerStats({ showChild }: PlayerStatsProps) {
  const { data: session } = useSession();
  const [stats, setStats] = useState({
    goals: 0,
    assists: 0,
    matchesPlayed: 0,
    motm: 0,
  });
  const [playerName, setPlayerName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    const supabase = createClient();

    async function fetchStats() {
      let targetUserId = session!.user!.id;

      if (showChild) {
        const { data: links } = await supabase
          .from("parent_student")
          .select("student_id")
          .eq("parent_id", session!.user!.id)
          .limit(1)
          .single();
        if (links) {
          targetUserId = links.student_id;
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", targetUserId)
            .single();
          if (profile) setPlayerName(`${profile.first_name} ${profile.last_name}`);
        } else {
          setLoading(false);
          return;
        }
      }

      const { data: matchStats } = await supabase
        .from("match_stats")
        .select("goals, assists")
        .eq("player_id", targetUserId);

      const { count: matchesPlayed } = await supabase
        .from("match_stats")
        .select("id", { count: "exact", head: true })
        .eq("player_id", targetUserId);

      const { count: motm } = await supabase
        .from("motm_votes")
        .select("id", { count: "exact", head: true })
        .eq("candidate_id", targetUserId);

      let totalGoals = 0;
      let totalAssists = 0;
      matchStats?.forEach((s) => {
        totalGoals += s.goals || 0;
        totalAssists += s.assists || 0;
      });

      setStats({
        goals: totalGoals,
        assists: totalAssists,
        matchesPlayed: matchesPlayed || 0,
        motm: motm || 0,
      });
      setLoading(false);
    }

    fetchStats();
  }, [session?.user?.id, showChild]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--royal)] border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const items = [
    {
      icon: Calendar,
      label: "Matchs joués",
      value: stats.matchesPlayed,
      color: "text-[var(--royal)]",
      bg: "bg-[var(--royal)]/10",
    },
    {
      icon: Target,
      label: "Buts marqués",
      value: stats.goals,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      icon: Star,
      label: "Passes décisives",
      value: stats.assists,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      icon: Trophy,
      label: "Homme du match",
      value: stats.motm,
      color: "text-[var(--gold)]",
      bg: "bg-amber-50",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {showChild && playerName
            ? `Stats de ${playerName}`
            : "Mes stats"}
        </CardTitle>
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
