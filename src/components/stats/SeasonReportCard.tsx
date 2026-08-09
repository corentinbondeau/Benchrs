"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Download, FileText, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { useTeam } from "@/lib/team";
import { currentSeasonLabel, previousSeasonLabel } from "@/lib/goals";
import type { SeasonReportContent } from "@/app/api/season/report/route";

function toPdfDataUrl(dataUrl: string): string {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export function SeasonReportCard({ teamId, isCoach }: { teamId: string; isCoach: boolean }) {
  const seasonNow = currentSeasonLabel();
  const [seasons] = useState(() => {
    const s = [seasonNow];
    let prev = seasonNow;
    for (let i = 0; i < 2; i++) {
      prev = previousSeasonLabel(prev);
      s.push(prev);
    }
    return s;
  });
  const [season, setSeason] = useState(seasonNow);
  const [report, setReport] = useState<SeasonReportContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { currentTeam } = useTeam();
  const teamName = currentTeam?.name || "Équipe";

  const loadReport = useCallback(async () => {
    const res = await authFetch(`/api/season/report?teamId=${teamId}&season=${season}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Erreur");
    return data?.report as SeasonReportContent | null;
  }, [teamId, season]);

  useEffect(() => {
    let cancelled = false;
    loadReport()
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadReport]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await authFetch("/api/season/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, season }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setReport(data.report as SeasonReportContent);
      toast.success("Bilan de saison généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  async function openPdf() {
    if (!report) return;
    setPdfLoading(true);
    try {
      const res = await authFetch("/api/season/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, teamName, season }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      const url = toPdfDataUrl(data.pdf as string);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération du PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[var(--color-gold)]" />
            Bilan de saison
          </CardTitle>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                Saison {s}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : report ? (
          <>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{report.title}</h3>
                <Badge className="bg-[var(--color-gold)]/20 text-[var(--color-gold)] border-[var(--color-gold)]/30">
                  {report.note_equipe}/10
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{report.summary}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: "Points forts", items: report.points_forts, cls: "text-emerald-700 border-emerald-200 bg-emerald-50" },
                { label: "Points à améliorer", items: report.points_faibles, cls: "text-amber-700 border-amber-200 bg-amber-50" },
                { label: "Axes de progression", items: report.axes_progression, cls: "text-blue-700 border-blue-200 bg-blue-50" },
              ].map((col) => (
                <div key={col.label} className={`rounded-lg border p-3 ${col.cls}`}>
                  <p className="text-xs font-semibold mb-1.5">{col.label}</p>
                  <ul className="space-y-1">
                    {col.items.length > 0 ? (
                      col.items.map((item, i) => (
                        <li key={i} className="text-xs leading-relaxed">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-xs opacity-70">—</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>

            {report.meilleurs_joueurs.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Meilleurs joueurs de la saison
                </p>
                <div className="space-y-1.5">
                  {report.meilleurs_joueurs.map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 shrink-0 rounded-full bg-[var(--color-gold)] text-[var(--color-navy)] text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium leading-tight">{m.nom}</p>
                        <p className="text-xs text-muted-foreground">{m.raison}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pdfLoading}
                onClick={openPdf}
                className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
              >
                {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                Télécharger le PDF
              </Button>
              {isCoach && (
                <Button variant="outline" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {generating ? "Génération..." : "Régénérer"}
                </Button>
              )}
            </div>
          </>
        ) : isCoach ? (
          <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
            <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun bilan de saison pour la saison {season}. Génère un résumé IA basé sur
              les statistiques de l&apos;équipe.
            </p>
            <Button
              className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={generate}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {generating ? "Génération..." : "Générer le bilan de saison"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun bilan de saison disponible pour la saison {season}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
