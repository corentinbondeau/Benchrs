"use client";

import { memo, useCallback } from "react";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
  Lightbulb,
} from "lucide-react";
import type { CoachInsightsData } from "@/lib/insights/coach-insights";

// ---------------------------------------------------------------------------
// Types locaux (reflètent CoachInsightsData côté client)
// ---------------------------------------------------------------------------
type AlertType = "warning" | "info" | "success";
type TrendDirection = "up" | "down" | "stable";

// ---------------------------------------------------------------------------
// Constantes de style
// ---------------------------------------------------------------------------
const ALERT_STYLES: Record<AlertType, { bg: string; border: string; icon: React.ElementType; iconColor: string; badgeClass: string; badgeLabel: string }> = {
  success: {
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800/50",
    icon: CheckCircle2,
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    badgeLabel: "Positif",
  },
  warning: {
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800/50",
    icon: AlertTriangle,
    iconColor: "text-amber-600 dark:text-amber-400",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    badgeLabel: "Attention",
  },
  info: {
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800/50",
    icon: Info,
    iconColor: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
    badgeLabel: "Info",
  },
};

const TREND_ICONS: Record<TrendDirection, React.ElementType> = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const TREND_COLORS: Record<TrendDirection, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-red-500 dark:text-red-400",
  stable: "text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function InsightsSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 w-full rounded bg-muted animate-pulse" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------
function CoachInsightsInner() {
  const { currentTeam } = useTeam();
  const teamId = currentTeam?.id;

  const fetcher = useCallback(async (): Promise<CoachInsightsData> => {
    if (!teamId) return { alerts: [], trends: [], suggestions: [] };
    const res = await authFetch(`/api/insights/coach?teamId=${encodeURIComponent(teamId)}`);
    if (!res.ok) throw new Error(`Insights fetch failed: ${res.status}`);
    return res.json();
  }, [teamId]);

  const { data, loading, isRevalidating, revalidate } = useQueryCache<CoachInsightsData>(
    teamId ? `insights:coach:${teamId}` : null,
    fetcher,
    { ttl: 5 * 60_000 } // 5 min — cohérent avec le cache serveur
  );

  if (!teamId) return null;

  if (loading && !data) return <InsightsSkeleton />;

  const insights = data ?? { alerts: [], trends: [], suggestions: [], isRulesBased: true };
  const hasContent =
    insights.alerts.length > 0 ||
    insights.trends.length > 0 ||
    insights.suggestions.length > 0;

  return (
    <Card>
      <CardContent className="p-4 md:p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--color-gold)] shrink-0" />
          <h3 className="font-semibold flex-1">Analyse de la semaine</h3>
          {insights.isRulesBased && (
            <span className="text-[10px] text-muted-foreground/70 italic">
              calculs automatiques
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => revalidate()}
            disabled={isRevalidating}
            title="Actualiser"
            aria-label="Actualiser les insights"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRevalidating ? "animate-spin text-muted-foreground" : ""}`}
            />
          </Button>
        </div>

        {/* État vide */}
        {!hasContent && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Pas encore assez de données pour générer des insights.
          </p>
        )}

        {/* Alertes */}
        {insights.alerts.length > 0 && (
          <div className="space-y-2">
            {insights.alerts.map((alert, i) => {
              const style = ALERT_STYLES[alert.type] ?? ALERT_STYLES.info;
              const Icon = style.icon;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${style.bg} ${style.border}`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${style.iconColor}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold leading-snug">{alert.title}</p>
                      <Badge className={`text-[10px] px-1.5 py-0 border ${style.badgeClass}`}>
                        {style.badgeLabel}
                      </Badge>
                    </div>
                    {alert.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {alert.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tendances */}
        {insights.trends.length > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Tendances
            </p>
            {insights.trends.map((trend, i) => {
              const TrendIcon = TREND_ICONS[trend.direction] ?? Minus;
              const color = TREND_COLORS[trend.direction] ?? "text-muted-foreground";
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <TrendIcon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span className="font-medium min-w-0 shrink-0">{trend.label}</span>
                  <span className="text-xs text-muted-foreground truncate ml-auto text-right">
                    {trend.detail}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Suggestions */}
        {insights.suggestions.length > 0 && (
          <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 border-blue-100 dark:border-blue-900/30 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                Suggestions
              </p>
            </div>
            {insights.suggestions.map((s, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-1.5">
                <span className="text-blue-400 shrink-0">·</span>
                {s}
              </p>
            ))}
          </div>
        )}

        {/* Loader de revalidation discret */}
        {isRevalidating && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 pt-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Mise à jour…
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const CoachInsights = memo(CoachInsightsInner);
