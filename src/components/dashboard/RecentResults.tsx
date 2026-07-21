"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Trophy, Minus } from "lucide-react";
import type { Event } from "@/types";

export function RecentResults() {
  const [matches, setMatches] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .eq("type", "match")
      .eq("status", "completed")
      .not("score_us", "is", null)
      .order("event_date", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setMatches((data as Event[]) || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (matches.length === 0) return null;

  function getResultColor(match: Event) {
    if (match.match_result === "win") return "border-l-green-500 bg-green-50 dark:bg-green-950/20";
    if (match.match_result === "loss") return "border-l-red-500 bg-red-50 dark:bg-red-950/20";
    return "border-l-amber-500 bg-amber-50 dark:bg-amber-950/20";
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
          Derniers resultats
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-3">
            {matches.map((match) => (
              <div
                key={match.id}
                className={`flex-shrink-0 rounded-lg border-l-4 p-3 min-w-[160px] ${getResultColor(match)}`}
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(match.event_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl font-bold tabular-nums">{match.score_us}</span>
                  <Minus className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xl font-bold tabular-nums">{match.score_them}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {match.opponent || match.title}
                </p>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
