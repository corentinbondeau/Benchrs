"use client";

import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { useQueryCache } from "@/lib/queryCache";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Trophy } from "lucide-react";
import type { Event } from "@/types";

export function RecentResults() {
  const router = useRouter();
  const { currentTeam } = useTeam();
  const { data: matches, loading } = useQueryCache<Event[]>(
    currentTeam ? `events:recent:${currentTeam.id}` : null,
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .eq("type", "match")
        .eq("status", "completed")
        .not("score_us", "is", null)
        .order("event_date", { ascending: false })
        .limit(10);
      return (data as Event[]) || [];
    },
    { ttl: 60_000 }
  );

  if (!currentTeam) return null;

  if (loading || !matches) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (matches.length === 0) return null;

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
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Trophy className="h-3.5 w-3.5" />
        Derniers resultats
      </h3>
      <ScrollArea className="w-full">
        <div className="flex gap-2.5 pb-2">
          {matches.map((match) => {
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
  );
}
