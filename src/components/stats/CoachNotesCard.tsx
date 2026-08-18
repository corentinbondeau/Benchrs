"use client";

import { useEffect, useState } from "react";
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
  event: {
    id: string;
    event_date: string | null;
    opponent: string | null;
    title: string | null;
    score_home: number | null;
    score_away: number | null;
    status: string;
  } | null;
  rater: {
    first_name: string;
    last_name: string;
  } | null;
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

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [ratingsRes, reportsRes, matchesRes] = await Promise.all([
        supabase
          .from("match_ratings")
          .select(
            "id, event_id, rater_id, rating, notes, created_at, event:events(id, event_date, opponent, title, score_home, score_away, status), rater:profiles!match_ratings_rater_id_fkey(first_name, last_name)",
          )
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

      if (cancelled) return;

      const ratings = (ratingsRes.data ?? []) as unknown as RatingRow[];
      const reports = (reportsRes.data ?? []) as unknown as ReportRow[];
      const totalMatchCount = (matchesRes.data ?? []).length;

      const reportMap = new Map<string, string>();
      for (const r of reports) {
        const summary = (r.content as Record<string, unknown>)?.summary;
        if (typeof summary === "string" && summary.trim()) {
          reportMap.set(r.event_id, summary.trim());
        }
      }

      const grouped = new Map<string, MatchEntry>();
      for (const row of ratings) {
        const ev = row.event;
        if (!ev) continue;
        if (!grouped.has(ev.id)) {
          grouped.set(ev.id, {
            eventId: ev.id,
            eventDate: ev.event_date,
            opponent: ev.opponent,
            title: ev.title,
            scoreHome: ev.score_home,
            scoreAway: ev.score_away,
            ratings: [],
            reportSummary: reportMap.get(ev.id) ?? null,
          });
        }
        grouped.get(ev.id)!.ratings.push({
          rating: Number(row.rating),
          notes: row.notes,
          raterName:
            row.rater
              ? `${row.rater.first_name} ${row.rater.last_name}`
              : "Coach",
        });
      }

      const sorted = [...grouped.values()].sort((a, b) => {
        const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
        const db = b.eventDate ? new Date(b.eventDate).getTime() : 0;
        return db - da;
      });

      setEntries(sorted);
      setTotalMatches(totalMatchCount);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [playerId, teamId]);

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
                    {formatDate(entry.eventDate)}
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
