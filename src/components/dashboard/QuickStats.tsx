"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, Trophy } from "lucide-react";

export function QuickStats() {
  const [stats, setStats] = useState({
    upcomingEvents: 0,
    totalPlayers: 0,
    recentWins: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchStats() {
      const [eventsRes, playersRes, winsRes] = await Promise.all([
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("status", "upcoming")
          .gte("event_date", new Date().toISOString()),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "player")
          .eq("is_active", true),
        supabase
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("match_result", "win")
          .gte(
            "event_date",
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          ),
      ]);

      setStats({
        upcomingEvents: eventsRes.count || 0,
        totalPlayers: playersRes.count || 0,
        recentWins: winsRes.count || 0,
      });
      setLoading(false);
    }

    fetchStats();
  }, []);

  const items = [
    {
      icon: Calendar,
      label: "Événements à venir",
      value: stats.upcomingEvents,
      color: "text-[var(--royal)]",
      bg: "bg-[var(--royal)]/10",
    },
    {
      icon: Users,
      label: "Joueurs actifs",
      value: stats.totalPlayers,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      icon: Trophy,
      label: "Victoires (30j)",
      value: stats.recentWins,
      color: "text-[var(--gold)]",
      bg: "bg-amber-50",
    },
  ];

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
