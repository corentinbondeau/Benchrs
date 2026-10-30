"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  eventId: string;
  teamId: string;
}

interface FeedbackRow {
  ambiance: number | null;
  communication: number | null;
  satisfaction: number | null;
  comment: string | null;
}

interface Averages {
  ambiance: number;
  communication: number;
  satisfaction: number;
  count: number;
  comments: string[];
}

const METRICS: { key: keyof Omit<Averages, "count" | "comments">; label: string; color: string }[] = [
  { key: "ambiance", label: "Ambiance", color: "bg-[var(--color-gold)]" },
  { key: "communication", label: "Communication", color: "bg-[var(--color-royal)]" },
  { key: "satisfaction", label: "Satisfaction", color: "bg-emerald-500" },
];

function avg(rows: FeedbackRow[], key: keyof Omit<FeedbackRow, "comment">): number {
  const valid = rows.map((r) => r[key]).filter((v): v is number => v !== null && v > 0);
  if (valid.length === 0) return 0;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

/** Hexagone SVG radar simplifié 5 points */
function RadarChart({ ambiance, communication, satisfaction }: { ambiance: number; communication: number; satisfaction: number }) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.8;
  const maxVal = 5;

  // 3 axes à 120° d'écart : haut, bas-gauche, bas-droite
  const angles = [-90, 30, 150].map((deg) => (deg * Math.PI) / 180);
  const values = [ambiance, communication, satisfaction];

  function point(angle: number, val: number) {
    const ratio = val / maxVal;
    return {
      x: cx + r * ratio * Math.cos(angle),
      y: cy + r * ratio * Math.sin(angle),
    };
  }

  function gridPoint(angle: number, ratio: number) {
    return {
      x: cx + r * ratio * Math.cos(angle),
      y: cy + r * ratio * Math.sin(angle),
    };
  }

  const dataPoints = angles.map((a, i) => point(a, values[i]));
  const dataPath =
    dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";

  // Grilles de fond (20%, 40%, 60%, 80%, 100%)
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {/* Grilles */}
      {gridLevels.map((ratio) => {
        const gp = angles.map((a) => gridPoint(a, ratio));
        const path = gp.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
        return (
          <path
            key={ratio}
            d={path}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
            className="text-foreground"
          />
        );
      })}

      {/* Axes */}
      {angles.map((a, i) => {
        const end = gridPoint(a, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x.toFixed(1)}
            y2={end.y.toFixed(1)}
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeWidth={1}
            className="text-foreground"
          />
        );
      })}

      {/* Zone de données */}
      <path
        d={dataPath}
        fill="hsl(var(--color-primary-blue, 220 90% 56%))"
        fillOpacity={0.25}
        stroke="hsl(var(--color-primary-blue, 220 90% 56%))"
        strokeWidth={2}
        className="fill-[var(--color-primary-blue)] stroke-[var(--color-primary-blue)]"
        style={{ fill: "var(--color-primary-blue, #3b82f6)", fillOpacity: 0.2, stroke: "var(--color-primary-blue, #3b82f6)" }}
      />

      {/* Points */}
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x.toFixed(1)}
          cy={p.y.toFixed(1)}
          r={4}
          style={{ fill: "var(--color-primary-blue, #3b82f6)" }}
        />
      ))}

      {/* Labels */}
      {angles.map((a, i) => {
        const lp = gridPoint(a, 1.22);
        return (
          <text
            key={i}
            x={lp.x.toFixed(1)}
            y={lp.y.toFixed(1)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill="currentColor"
            fillOpacity={0.65}
            className="text-foreground"
          >
            {["Ambiance", "Communication", "Satisfaction"][i]}
          </text>
        );
      })}
    </svg>
  );
}

function applyRows(rows: FeedbackRow[]): Averages | null {
  if (rows.length === 0) return null;
  return {
    ambiance: avg(rows, "ambiance"),
    communication: avg(rows, "communication"),
    satisfaction: avg(rows, "satisfaction"),
    count: rows.length,
    comments: rows
      .map((r) => r.comment)
      .filter((c): c is string => !!c && c.trim().length > 0),
  };
}

export function MatchFeedback360Summary({ eventId, teamId }: Props) {
  const [averages, setAverages] = useState<Averages | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Chargement initial via useEffect (pattern .then pour éviter setState sync dans l'effect)
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("match_feedback_360")
      .select("ambiance, communication, satisfaction, comment")
      .eq("event_id", eventId)
      .eq("team_id", teamId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[MatchFeedback360Summary] load error:", error);
        } else {
          setAverages(applyRows((data as FeedbackRow[]) ?? []));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, teamId]);

  // Refresh manuel (bouton) — async function hors useEffect est autorisée
  async function refresh() {
    setRefreshing(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("match_feedback_360")
        .select("ambiance, communication, satisfaction, comment")
        .eq("event_id", eventId)
        .eq("team_id", teamId);
      if (error) throw error;
      setAverages(applyRows((data as FeedbackRow[]) ?? []));
    } catch (e) {
      console.error("[MatchFeedback360Summary] refresh error:", e);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[var(--color-royal)]" />
            Bilan feedback 360°
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={refresh}
            disabled={refreshing}
            title="Actualiser"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !averages ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucun feedback reçu pour ce match.
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground">
              {averages.count} réponse{averages.count > 1 ? "s" : ""}
            </p>

            {/* Radar */}
            <div className="flex justify-center">
              <RadarChart
                ambiance={averages.ambiance}
                communication={averages.communication}
                satisfaction={averages.satisfaction}
              />
            </div>

            {/* Barres horizontales */}
            <div className="space-y-3">
              {METRICS.map(({ key, label, color }) => {
                const val = averages[key];
                const pct = Math.round((val / 5) * 100);
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="font-bold tabular-nums">
                        {val.toFixed(1)}<span className="text-muted-foreground font-normal">/5</span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Commentaires */}
            {averages.comments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Commentaires ({averages.comments.length})
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {averages.comments.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground italic"
                    >
                      &quot;{c}&quot;
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
