"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Shield } from "lucide-react";

interface SeasonStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
}

export function SeasonSummary() {
  const [stats, setStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("match_result, score_us, score_them")
      .eq("type", "match")
      .eq("status", "completed")
      .then(({ data: matches }) => {
        if (!matches || matches.length === 0) {
          setLoading(false);
          return;
        }

        const season: SeasonStats = {
          played: matches.length,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          cleanSheets: 0,
        };

        for (const m of matches) {
          if (m.match_result === "win") season.won++;
          else if (m.match_result === "draw") season.drawn++;
          else if (m.match_result === "loss") season.lost++;
          season.goalsFor += m.score_us || 0;
          season.goalsAgainst += m.score_them || 0;
          if ((m.score_them || 0) === 0) season.cleanSheets++;
        }

        setStats(season);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.played === 0) return null;

  const goalDiff = stats.goalsFor - stats.goalsAgainst;
  const winRate = Math.round((stats.won / stats.played) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--color-royal)]" />
          Bilan de la saison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <span className="text-2xl font-bold text-green-600">{stats.won}</span>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">V</p>
          </div>
          <span className="text-muted-foreground">-</span>
          <div className="text-center">
            <span className="text-2xl font-bold text-amber-500">{stats.drawn}</span>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">N</p>
          </div>
          <span className="text-muted-foreground">-</span>
          <div className="text-center">
            <span className="text-2xl font-bold text-red-500">{stats.lost}</span>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">D</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-lg font-bold">{stats.played}</p>
            <p className="text-[10px] text-muted-foreground">Matchs</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-lg font-bold">{winRate}%</p>
            <p className="text-[10px] text-muted-foreground">Victoires</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <div className="flex items-center justify-center gap-1">
              <span className="text-lg font-bold">{stats.goalsFor}</span>
              <span className="text-xs text-muted-foreground">-</span>
              <span className="text-lg font-bold">{stats.goalsAgainst}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Buts (+{goalDiff})</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <div className="flex items-center justify-center gap-1">
              {goalDiff > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : goalDiff < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <Minus className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-lg font-bold">{stats.cleanSheets}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">Clean Sheets</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
