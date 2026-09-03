"use client";

import { memo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { useQueryCache } from "@/lib/queryCache";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Trophy, Calendar } from "lucide-react";
import type { Event } from "@/types";

interface FeedData {
  upcoming: Event[];
  results: Event[];
}

function RecentResults() {
  const router = useRouter();
  const { currentTeam } = useTeam();
  const { data, loading } = useQueryCache<FeedData>(
    currentTeam ? `events:feed:${currentTeam.id}` : null,
    async () => {
      const supabase = createClient();
      const nowISO = new Date().toISOString();
      const [upcomingRes, resultsRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, type, event_date, opponent, status")
          .eq("team_id", currentTeam!.id)
          .in("status", ["upcoming", "ongoing"])
          .gte("event_date", nowISO)
          .order("event_date", { ascending: true })
          .limit(5),
        supabase
          .from("events")
          .select("id, title, type, event_date, score_us, score_them, opponent, match_result")
          .eq("team_id", currentTeam!.id)
          .eq("type", "match")
          .eq("status", "completed")
          .not("score_us", "is", null)
          .order("event_date", { ascending: false })
          .limit(5),
      ]);
      return {
        upcoming: (upcomingRes.data as Event[]) || [],
        results: (resultsRes.data as Event[]) || [],
      };
    },
    { ttl: 60_000 }
  );

  if (!currentTeam) return null;

  if (loading || !data) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const { upcoming, results } = data;
  if (upcoming.length === 0 && results.length === 0) return null;

  function getResultStyles(match: Event) {
    if (match.match_result === "win") return {
      border: "border-l-[var(--color-success)]",
      bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
      label: "V",
      labelColor: "text-[var(--color-success)]",
    };
    if (match.match_result === "loss") return {
      border: "border-l-[var(--color-danger)]",
      bg: "bg-red-50/60 dark:bg-red-950/20",
      label: "D",
      labelColor: "text-[var(--color-danger)]",
    };
    return {
      border: "border-l-[var(--color-warning)]",
      bg: "bg-amber-50/60 dark:bg-amber-950/20",
      label: "N",
      labelColor: "text-[var(--color-warning)]",
    };
  }

  return (
    <div className="space-y-5">
      {/* Prochains événements */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            À venir
          </h3>
          <ScrollArea className="w-full">
            <div className="flex gap-2.5 pb-2">
              {upcoming.map((ev) => {
                const isMatch = ev.type === "match";
                const evDate = new Date(ev.event_date);
                return (
                  <button
                    key={ev.id}
                    onClick={() => router.push(isMatch ? `/matches/${ev.id}` : `/trainings/${ev.id}`)}
                    className="flex-shrink-0 rounded-xl border-l-[3px] border-l-[var(--color-primary-blue)] bg-blue-50/60 dark:bg-blue-950/20 p-3.5 min-w-[140px] text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">
                        {evDate.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--color-primary-blue)]">
                        {evDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm font-semibold mt-1 truncate">
                      {isMatch ? (ev.opponent || ev.title) : ev.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {isMatch ? "Match" : "Entraînement"}
                    </p>
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}

      {/* Derniers résultats */}
      {results.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" />
            Derniers résultats
          </h3>
          <ScrollArea className="w-full">
            <div className="flex gap-2.5 pb-2">
              {results.map((match) => {
                const styles = getResultStyles(match);
                return (
                  <button
                    key={match.id}
                    onClick={() => router.push(`/matches/${match.id}`)}
                    className={`flex-shrink-0 rounded-xl border-l-[3px] ${styles.border} ${styles.bg} p-3.5 min-w-[140px] text-left hover:opacity-80 transition-opacity`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(match.event_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </span>
                      <span className={`text-xs font-bold ${styles.labelColor}`}>{styles.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-xl font-bold tabular-nums">{match.score_us}</span>
                      <span className="text-muted-foreground text-xs">-</span>
                      <span className="text-xl font-bold tabular-nums">{match.score_them}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                      {match.opponent || match.title}
                    </p>
                  </button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

export default memo(RecentResults);
