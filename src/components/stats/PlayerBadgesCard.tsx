"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Flame, Trophy, Medal, Star, Target, CalendarCheck, Gauge } from "lucide-react";

interface BadgeRow {
  id: string;
  icon: typeof Flame;
  label: string;
  description: string;
  earned: boolean;
  tone: string;
}

interface RawAttendance {
  status: "present" | "absent" | "late" | "excused" | "pending";
}

interface RawMatchStat {
  goals: number;
  minutes_played: number;
}

export function PlayerBadgesCard({
  playerId,
  teamId,
}: {
  playerId: string;
  teamId: string;
}) {
  const [badges, setBadges] = useState<BadgeRow[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [statsRes, attRes] = await Promise.all([
        supabase
          .from("match_stats")
          .select("goals, minutes_played")
          .eq("player_id", playerId)
          .eq("team_id", teamId),
        supabase
          .from("attendances")
          .select("status")
          .eq("user_id", playerId)
          .eq("team_id", teamId),
      ]);

      const stats = (statsRes.data || []) as RawMatchStat[];
      const atts = (attRes.data || []) as RawAttendance[];

      const goals = stats.reduce((sum, s) => sum + (s.goals || 0), 0);
      const matches = stats.length;
      const minutes = stats.reduce((sum, s) => sum + (s.minutes_played || 0), 0);

      let bestStreak = 0;
      let cur = 0;
      for (const a of atts) {
        if (a.status === "present" || a.status === "late") {
          cur++;
          bestStreak = Math.max(bestStreak, cur);
        } else {
          cur = 0;
        }
      }
      const attendanceRate = atts.length > 0
        ? Math.round((atts.filter((a) => a.status === "present" || a.status === "late").length / atts.length) * 100)
        : 0;

      const gold = "bg-amber-50 text-amber-600";
      const gray = "bg-muted text-muted-foreground";

      const list: BadgeRow[] = [
        {
          id: "first-goal",
          icon: Target,
          label: "Premier but",
          description: goals >= 1 ? "A marqué son premier but" : "Encore à marquer",
          earned: goals >= 1,
          tone: goals >= 1 ? gold : gray,
        },
        {
          id: "goals-5",
          icon: Trophy,
          label: "Régularité devant le but",
          description: "5 buts inscrits",
          earned: goals >= 5,
          tone: goals >= 5 ? gold : gray,
        },
        {
          id: "goals-10",
          icon: Trophy,
          label: "Buteur confirmé",
          description: "10 buts inscrits",
          earned: goals >= 10,
          tone: goals >= 10 ? gold : gray,
        },
        {
          id: "goals-25",
          icon: Trophy,
          label: "Machine à buts",
          description: "25 buts inscrits",
          earned: goals >= 25,
          tone: goals >= 25 ? gold : gray,
        },
        {
          id: "matches-10",
          icon: CalendarCheck,
          label: "Dix matchs",
          description: "10 matchs joués",
          earned: matches >= 10,
          tone: matches >= 10 ? gold : gray,
        },
        {
          id: "matches-50",
          icon: Medal,
          label: "Quinquagénaire",
          description: "50 matchs joués",
          earned: matches >= 50,
          tone: matches >= 50 ? gold : gray,
        },
        {
          id: "minutes-500",
          icon: Gauge,
          label: "Titulaire en puissance",
          description: "500 minutes de jeu",
          earned: minutes >= 500,
          tone: minutes >= 500 ? gold : gray,
        },
        {
          id: "attendance-80",
          icon: Star,
          label: "Assidu",
          description: `${attendanceRate}% de présence`,
          earned: attendanceRate >= 80,
          tone: attendanceRate >= 80 ? gold : gray,
        },
        {
          id: "streak-5",
          icon: Flame,
          label: "Série en cours",
          description: `Meilleure série de présences : ${bestStreak}`,
          earned: bestStreak >= 5,
          tone: bestStreak >= 5 ? gold : gray,
        },
      ];

      if (!cancelled) setBadges(list);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [playerId, teamId]);

  if (!badges) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Flame className="h-4 w-4 text-[var(--color-gold)]" />
          Badges & séries
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${
                b.earned ? "border-amber-200" : "border-border opacity-60"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${b.tone}`}>
                <b.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className={`text-xs font-semibold ${b.earned ? "" : "text-muted-foreground"}`}>
                  {b.label}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">{b.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
