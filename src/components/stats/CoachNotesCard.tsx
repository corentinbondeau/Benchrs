"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RatingStars } from "@/components/match/RatingStars";
import { BookOpen, Calendar, MessageSquare } from "lucide-react";

interface RatingRow {
  id: string;
  event_id: string;
  rater_id: string;
  rating: number;
  notes: string | null;
  created_at: string;
}

interface ReportRow {
  event_id: string;
  content: {
    summary?: string;
  };
}

interface MatchEntry {
  eventId: string;
  eventDate: string | null;
  ratingDate: string | null;
  opponent: string | null;
  title: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  ratings: {
    rating: number;
    notes: string | null;
    raterName: string;
  }[];
  reportSummary: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function matchResult(
  home: number | null,
  away: number | null,
): "win" | "loss" | "draw" | null {
  if (home == null || away == null) return null;
  if (home > away) return "win";
  if (home < away) return "loss";
  return "draw";
}

const RESULT_BORDER: Record<string, string> = {
  win: "border-l-green-500",
  loss: "border-l-red-500",
  draw: "border-l-gray-400",
};

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  win: { label: "V", className: "bg-green-100 text-green-700" },
  loss: { label: "D", className: "bg-red-100 text-red-700" },
  draw: { label: "N", className: "bg-gray-100 text-gray-600" },
};

export function CoachNotesCard({
  playerId,
  teamId,
}: {
  playerId: string;
  teamId: string;
}) {
  const [entries, setEntries] = useState<MatchEntry[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  interface MatchEventRow {
  id: string;
  event_date: string | null;
  opponent: string | null;
  title: string | null;
  score_home: number | null;
  score_away: number | null;
  status: string;
}

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
}

const load = useCallback(async (): Promise<{
    entries: MatchEntry[];
    totalMatches: number;
  }> => {
    const supabase = createClient();
    const [ratingsRes, reportsRes, matchesRes] = await Promise.all([
      supabase
        .from("match_ratings")
        .select("id, event_id, rater_id, rating, notes, created_at")
        .eq("player_id", playerId)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
      supabase
        .from("match_reports")
        .select("event_id, content")
        .eq("team_id", teamId),
      supabase
        .from("events")
        .select("id")
        .eq("team_id", teamId)
        .eq("type", "match")
        .eq("status", "completed"),
    ]);

    const ratings = (ratingsRes.data ?? []) as RatingRow[];
    const reports = (reportsRes.data ?? []) as unknown as ReportRow[];
    const totalMatchCount = (matchesRes.data ?? []).length;

    const rowEventIds = ratings.map((r) => r.event_id);
    const rowRaterIds = ratings.map((r) => r.rater_id);

    const [eventsRes, ratersRes] = await Promise.all([
      rowEventIds.length
        ? supabase.from("events").select(
            "id, event_date, opponent, title, score_home, score_away, status",
          ).in("id", rowEventIds)
        : Promise.resolve<{ data: MatchEventRow[] | null }>({ data: [] }),
      rowRaterIds.length
        ? supabase.from("profiles").select("id, first_name, last_name").in(
            "id",
            rowRaterIds,
          )
        : Promise.resolve<{ data: ProfileRow[] | null }>({ data: [] }),
    ]);

    const eventById = new Map<string, MatchEventRow>();
    for (const ev of (eventsRes.data ?? []) as MatchEventRow[]) {
      eventById.set(ev.id, ev);
    }

    const raterById = new Map<
      string,
      { first_name: string; last_name: string }
    >();
    for (const r of (ratersRes.data ?? []) as ProfileRow[]) {
      raterById.set(r.id, r);
    }

    const reportMap = new Map<string, string>();
    for (const r of reports) {
      const summary = (r.content as Record<string, unknown>)?.summary;
      if (typeof summary === "string" && summary.trim()) {
        reportMap.set(r.event_id, summary.trim());
      }
    }

    const grouped = new Map<string, MatchEntry>();
    for (const row of ratings) {
      const ev = eventById.get(row.event_id);
      if (!grouped.has(row.event_id)) {
        grouped.set(row.event_id, {
          eventId: row.event_id,
          eventDate: ev?.event_date ?? null,
          ratingDate: row.created_at ?? null,
          opponent: ev?.opponent ?? null,
          title: ev?.title ?? null,
          scoreHome: ev?.score_home ?? null,
          scoreAway: ev?.score_away ?? null,
          ratings: [],
          reportSummary: reportMap.get(row.event_id) ?? null,
        });
      }
      const rater = raterById.get(row.rater_id);
      grouped.get(row.event_id)!.ratings.push({
        rating: Number(row.rating),
        notes: row.notes,
        raterName: rater ? `${rater.first_name} ${rater.last_name}` : "Coach",
      });
    }

    const sorted = [...grouped.values()].sort((a, b) => {
      const da = new Date(a.eventDate ?? a.ratingDate ?? 0).getTime();
      const db = new Date(b.eventDate ?? b.ratingDate ?? 0).getTime();
      return db - da;
    });

    return { entries: sorted, totalMatches: totalMatchCount };
  }, [playerId, teamId]);

  useEffect(() => {
    const supabase = createClient();
    const apply = (res: { entries: MatchEntry[]; totalMatches: number }) => {
      setEntries(res.entries);
      setTotalMatches(res.totalMatches);
      setLoading(false);
    };

    load().then(apply);

    const channel = supabase
      .channel(`match-ratings:${teamId}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_ratings",
          filter: `player_id=eq.${playerId},team_id=eq.${teamId}`,
        },
        () => {
          load().then(apply);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, teamId, playerId, instanceId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--color-royal)]" />
          Carnet du joueur
          {entries.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {entries.length} note{entries.length > 1 ? "s" : ""} sur{" "}
              {totalMatches} match{totalMatches > 1 ? "s" : ""}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Chargement…
          </p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">Aucune note du coach pour le moment</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const result = matchResult(entry.scoreHome, entry.scoreAway);
              const borderClass = result ? RESULT_BORDER[result] : "border-l-gray-300";
              const badge = result ? RESULT_BADGE[result] : null;

              return (
                <div
                  key={entry.eventId}
                  className={`rounded-lg border border-l-4 ${borderClass} p-3 space-y-2`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold truncate">
                        {entry.opponent || entry.title || "Match"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {badge && (
                        <Badge
                          variant="secondary"
                          className={`text-xs font-bold ${badge.className}`}
                        >
                          {badge.label}
                        </Badge>
                      )}
                      {entry.scoreHome != null && entry.scoreAway != null && (
                        <span className="text-sm font-mono font-semibold">
                          {entry.scoreHome}–{entry.scoreAway}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {entry.eventDate
                      ? formatDate(entry.eventDate)
                      : entry.ratingDate
                        ? `Noté le ${formatDate(entry.ratingDate)}`
                        : "—"}
                  </span>

                  {entry.ratings.map((r, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <RatingStars value={r.rating} size="h-4 w-4" />
                        <span className="text-xs font-semibold">
                          {r.rating}/10
                        </span>
                        {entry.ratings.length > 1 && (
                          <span className="text-xs text-muted-foreground">
                            — {r.raterName}
                          </span>
                        )}
                      </div>
                      {r.notes && (
                        <blockquote className="border-l-4 border-[var(--color-gold)] pl-3 italic text-muted-foreground text-sm">
                          {r.notes}
                        </blockquote>
                      )}
                    </div>
                  ))}

                  {entry.reportSummary && (
                    <div className="rounded bg-muted/40 px-3 py-2 mt-1">
                      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">
                        Compte-rendu d&apos;équipe
                      </p>
                      <p className="text-xs italic text-muted-foreground leading-relaxed">
                        {entry.reportSummary}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
