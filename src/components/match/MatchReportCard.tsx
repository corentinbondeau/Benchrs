"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles, Loader2, Star, ThumbsUp, AlertCircle, TrendingUp, Trophy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import type { MatchReportContent } from "@/app/api/matches/report/route";

interface Props {
  matchId: string;
  teamId: string;
  isCoach: boolean;
  hasData: boolean;
}

export function MatchReportCard({ matchId, teamId, isCoach, hasData }: Props) {
  const [report, setReport] = useState<MatchReportContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/matches/report?eventId=${matchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setReport(data?.report ?? null);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  async function notifyPublished() {
    try {
      const supabase = createClient();
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .in("role", ["player"]);
      const playerIds = (members || []).map((m) => m.user_id);
      if (playerIds.length === 0) return;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .in("id", playerIds)
        .eq("is_active", true);
      const activePlayerIds = (profiles || []).map((p) => p.id);
      if (activePlayerIds.length === 0) return;

      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", teamId)
        .in("student_id", activePlayerIds);
      const parentIds = [
        ...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id)),
      ];
      const userIds = [...new Set([...activePlayerIds, ...parentIds])];

      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: userIds,
          title: "Compte-rendu du match publié",
          body: report?.title || "Le compte-rendu du match est disponible",
          type: "match_report",
          reference_id: matchId,
          team_id: teamId,
          url: `/matches/${matchId}`,
        }),
      });
    } catch (err) {
      console.error("[match-report] notify error:", err);
    }
  }

  async function generate() {
    if (!hasData) {
      toast.error("Renseigne d'abord le score du match");
      return;
    }
    setGenerating(true);
    try {
      const res = await authFetch("/api/matches/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: matchId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      setReport(data.report as MatchReportContent);
      toast.success("Compte-rendu généré !");
      notifyPublished();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--color-gold)]" />
            Compte-rendu du match
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--color-gold)]" />
            Compte-rendu du match
          </CardTitle>
          {isCoach && (
            <Button
              size="sm"
              className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={generate}
              disabled={generating || !hasData}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
              {report ? "Régénérer" : "Générer le rapport IA"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-sm text-muted-foreground">
            {isCoach
              ? "Génère un compte-rendu automatique du match (points forts, points à améliorer, axes de progression) à partir du score et des stats. Il sera partagé avec les joueurs et les parents."
              : "Le compte-rendu du match n'a pas encore été publié."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold text-sm">{report.title}</h4>
              {report.note_equipe > 0 && (
                <div className="flex items-center gap-1 rounded-lg bg-[var(--color-gold)]/20 px-3 py-1.5">
                  <Star className="h-4 w-4 fill-[var(--color-gold)] text-[var(--color-gold)]" />
                  <span className="text-sm font-bold">{report.note_equipe}/10</span>
                </div>
              )}
            </div>

            {report.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
            )}

            {report.points_forts.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                  <ThumbsUp className="h-3.5 w-3.5" /> Points forts
                </p>
                <ul className="space-y-1">
                  {report.points_forts.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-900">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.points_faibles.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Points à améliorer
                </p>
                <ul className="space-y-1">
                  {report.points_faibles.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.axes_progression.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Axes de progression
                </p>
                <ul className="space-y-1">
                  {report.axes_progression.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.meilleurs_joueurs.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-[var(--color-gold)]" /> Joueurs à l&apos;honneur
                </p>
                <ul className="space-y-1.5">
                  {report.meilleurs_joueurs.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="font-semibold shrink-0">{m.nom}</span>
                      {m.raison && <span className="text-muted-foreground">{m.raison}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isCoach && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Share2 className="h-3 w-3" /> Généré par IA et partagé avec les joueurs et parents à chaque régénération.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
