"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "lucide-react";
import { currentSeasonLabel, seasonDateRange } from "@/lib/goals";

interface StatRow {
  goals: number;
  assists: number;
  minutes_played: number;
  yellow_cards: number;
  red_cards: number;
  event_id: string;
  team_id: string;
  event: {
    event_date: string | null;
    match_result: "win" | "loss" | "draw" | null;
    score_us: number | null;
    score_them: number | null;
  } | null;
}

interface TeamRow {
  name: string;
}

interface SeasonAgg {
  matchs: number;
  minutes: number;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
  wins: number;
  draws: number;
  losses: number;
}

function seasonKeyFromDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

function emptyAgg(): SeasonAgg {
  return { matchs: 0, minutes: 0, goals: 0, assists: 0, yellows: 0, reds: 0, wins: 0, draws: 0, losses: 0 };
}

export function CareerHistoryCard({ playerId }: { playerId: string }) {
  const [stats, setStats] = useState<StatRow[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("match_stats")
        .select(
          "goals, assists, minutes_played, yellow_cards, red_cards, event_id, team_id, event:events!match_stats_event_id_fkey(event_date, match_result, score_us, score_them)"
        )
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const rows = ((data || []) as unknown as StatRow[]).filter((r) => r.event);
      setStats(rows);
      const teamIds = [...new Set(rows.map((r) => r.team_id))];
      if (teamIds.length > 0) {
        const { data: teams } = await supabase
          .from("teams")
          .select("id, name")
          .in("id", teamIds);
        const map: Record<string, string> = {};
        for (const t of (teams || []) as TeamRow[] & { id: string }[]) map[t.id] = t.name;
        if (!cancelled) setTeamNames(map);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const seasons = useMemo(() => {
    const map = new Map<string, Map<string, SeasonAgg>>();
    for (const s of stats) {
      const season = seasonKeyFromDate(s.event?.event_date ?? null);
      if (!season) continue;
      const teamAgg = map.get(season) ?? new Map<string, SeasonAgg>();
      const agg = teamAgg.get(s.team_id) ?? emptyAgg();
      agg.matchs += 1;
      agg.minutes += s.minutes_played || 0;
      agg.goals += s.goals || 0;
      agg.assists += s.assists || 0;
      agg.yellows += s.yellow_cards || 0;
      agg.reds += s.red_cards || 0;
      if (s.event?.match_result === "win") agg.wins += 1;
      else if (s.event?.match_result === "draw") agg.draws += 1;
      else if (s.event?.match_result === "loss") agg.losses += 1;
      teamAgg.set(s.team_id, agg);
      map.set(season, teamAgg);
    }
    const seasonsArr = [...map.entries()].sort((a, b) => (b[0] < a[0] ? -1 : 1));
    const current = currentSeasonLabel();
    return {
      current,
      seasonsArr,
      seasonRanges: Object.fromEntries(
        seasonsArr.map(([s]) => {
          const range = seasonDateRange(s);
          return [s, range ? `${range.start.getFullYear()}/${range.start.getMonth() + 1} – ${range.end.getFullYear()}/${range.end.getMonth() + 1}` : ""];
        })
      ),
    };
  }, [stats]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-[var(--color-royal)]" />
          Historique de carrière
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : seasons.seasonsArr.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune donnée de match enregistrée.</p>
        ) : (
          <div className="space-y-4">
            {seasons.seasonsArr.map(([season, teamAggs]) => {
              const totals = emptyAgg();
              for (const agg of teamAggs.values()) {
                totals.matchs += agg.matchs;
                totals.minutes += agg.minutes;
                totals.goals += agg.goals;
                totals.assists += agg.assists;
                totals.yellows += agg.yellows;
                totals.reds += agg.reds;
                totals.wins += agg.wins;
                totals.draws += agg.draws;
                totals.losses += agg.losses;
              }
              const isCurrent = season === seasons.current;
              return (
                <div key={season} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">
                      Saison {season}
                      {isCurrent && (
                        <span className="ml-2 rounded bg-[var(--color-gold)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-navy)]">
                          EN COURS
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{seasons.seasonRanges[season]}</p>
                  </div>

                  <div className="mt-2 space-y-2">
                    {[...teamAggs.entries()].map(([teamId, agg]) => (
                      <div
                        key={teamId}
                        className="rounded-lg bg-muted/50 p-2.5 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">{teamNames[teamId] || "Équipe"}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-bold text-emerald-600">{agg.wins}V</span>{" "}
                            <span className="font-bold text-amber-600">{agg.draws}N</span>{" "}
                            <span className="font-bold text-red-600">{agg.losses}D</span>
                          </p>
                        </div>
                        <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-xs">
                          <div className="rounded bg-card p-1">
                            <p className="font-bold">{agg.matchs}</p>
                            <p className="text-[10px] text-muted-foreground">Matchs</p>
                          </div>
                          <div className="rounded bg-card p-1">
                            <p className="font-bold">{agg.minutes}</p>
                            <p className="text-[10px] text-muted-foreground">Min</p>
                          </div>
                          <div className="rounded bg-card p-1">
                            <p className="font-bold text-emerald-700">{agg.goals}</p>
                            <p className="text-[10px] text-muted-foreground">Buts</p>
                          </div>
                          <div className="rounded bg-card p-1">
                            <p className="font-bold">{agg.assists}</p>
                            <p className="text-[10px] text-muted-foreground">Passes</p>
                          </div>
                          <div className="rounded bg-card p-1">
                            <p className="font-bold">
                              {agg.yellows > 0 || agg.reds > 0 ? `${agg.yellows}J${agg.reds > 0 ? ` ${agg.reds}R` : ""}` : "0"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Cartons</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Total : <span className="font-bold text-foreground">{totals.matchs} matchs</span>
                      </span>
                      <span>
                        {totals.goals} buts · {totals.assists} passes
                      </span>
                      <span>
                        {totals.minutes} min · {totals.wins + totals.draws + totals.losses > 0 && `${totals.wins}V ${totals.draws}N ${totals.losses}D`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
