"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sparkles, RefreshCw, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { authFetch } from "@/lib/api-client";
import { quarterKeyForDate, quarterLabel } from "@/lib/goals";

interface Report {
  player_id: string;
  content: {
    playerId: string;
    title: string;
    progression: string;
    assiduite: string;
    comportement: string;
    axes: string[];
  };
}

function quarterKeysBack(now: Date, n: number): string[] {
  const keys: string[] = [];
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = 0; i < n; i++) {
    keys.push(quarterKeyForDate(d));
    d.setMonth(d.getMonth() - 3);
  }
  return keys;
}

export function QuarterlyReportsCard({
  playerId,
  teamId,
  isCoach,
}: {
  playerId: string;
  teamId: string;
  isCoach: boolean;
}) {
  const quarters = quarterKeysBack(new Date(), 4);
  const [quarterIdx, setQuarterIdx] = useState(0);
  const quarter = quarters[quarterIdx];
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(
    async (q: string) => {
      const res = await authFetch(
        `/api/reports/quarterly?teamId=${encodeURIComponent(teamId)}&quarter=${encodeURIComponent(q)}`
      );
      if (!res.ok) throw new Error("Impossible de charger les bilans");
      const json = await res.json();
      return (json.reports || []) as Report[];
    },
    [teamId]
  );

  useEffect(() => {
    let cancelled = false;
    loadData(quarter)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch(() => {
        if (!cancelled) setReports([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quarter, loadData]);

  const myReport = reports.find((r) => r.player_id === playerId)?.content;

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await authFetch("/api/reports/quarterly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, quarter }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur lors de la génération");
      const data = await loadData(quarter);
      setReports(data);
      toast.success(`Bilans générés pour ${quarterLabel(quarter)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 text-[var(--color-gold)] shrink-0" />
          <CardTitle className="text-base">Bilans trimestriels</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={quarterIdx >= quarters.length - 1}
            onClick={() => setQuarterIdx((i) => Math.min(i + 1, quarters.length - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{quarterLabel(quarter)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={quarterIdx <= 0}
            onClick={() => setQuarterIdx((i) => Math.max(i - 1, 0))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isCoach && (
          <Button
            onClick={generate}
            disabled={generating}
            className="w-full bg-[var(--color-gold)] text-black hover:opacity-90"
          >
            {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? "Génération en cours…" : "Générer les bilans du trimestre"}
          </Button>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Chargement…</p>
        ) : myReport ? (
          <div className="space-y-3">
            <div>
              <h4 className="font-semibold flex items-center gap-2">
                {myReport.title}
                {isCoach && <Badge variant="outline" className="text-[10px]">IA</Badge>}
              </h4>
              {myReport.progression && <p className="text-sm mt-1">{myReport.progression}</p>}
            </div>
            {myReport.assiduite && (
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Assiduité</p>
                <p className="text-sm">{myReport.assiduite}</p>
              </div>
            )}
            {myReport.comportement && (
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Comportement</p>
                <p className="text-sm">{myReport.comportement}</p>
              </div>
            )}
            {myReport.axes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Axes de progression</p>
                <ul className="list-disc list-inside text-sm space-y-1">
                  {myReport.axes.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            {isCoach
              ? "Aucun bilan pour ce trimestre. Générez-le pour l'ensemble de l'équipe."
              : "Pas encore de bilan pour ce trimestre."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
