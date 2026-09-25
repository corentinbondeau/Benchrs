"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signedStorageUrl } from "@/lib/storage";
import {
  VideoAnalysis,
  formatVideoDuration,
  formatVideoTime,
  videoAnalysisStatusLabel,
} from "@/lib/videoAnalysis";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Crosshair,
  Loader2,
  Maximize2,
  Play,
  RefreshCcw,
  Target,
  Video,
} from "lucide-react";

export function MatchVideoDashboard({ job }: { job: VideoAnalysis }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!job.storage_path) return;
    signedStorageUrl(createClient(), "match_videos", job.storage_path, 3600).then(
      (url) => {
        if (mounted && url) setVideoUrl(url);
      }
    );
    return () => {
      mounted = false;
    };
  }, [job.storage_path]);

  // ── États intermédiaires ──────────────────────────────────
  if (job.status === "pending" || job.status === "processing") {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--color-royal)]" />
              {videoAnalysisStatusLabel(job.status)}
            </div>
            <Badge variant="secondary">{job.progress}%</Badge>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--color-gold)] transition-all"
              style={{ width: `${Math.max(2, job.progress)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            détection des joueurs… Le rapport s&apos;affichera automatiquement.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (job.status === "failed") {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2 font-medium text-destructive">
            <RefreshCcw className="h-4 w-4" />
            {videoAnalysisStatusLabel(job.status)}
          </div>
          {job.error && (
            <p className="text-sm text-muted-foreground">{job.error}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Supprime cette analyse puis ré-importe la vidéo pour relancer le
            traitement.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (job.status === "canceled" || !job.result) {
    return (
      <Card>
        <CardContent className="p-5">
          <Badge variant="secondary">{videoAnalysisStatusLabel(job.status)}</Badge>
        </CardContent>
      </Card>
    );
  }

  // ── Rapport terminé ───────────────────────────────────────
  const { stats, teams, timeline, meta } = job.result;
  const t1 = teams.team1;
  const t2 = teams.team2;
  const totalShots = stats.shots.team1 + stats.shots.team2;
  const totalShotsOnTarget = stats.shots_on_target.team1 + stats.shots_on_target.team2;

  return (
    <div className="space-y-4">
      {/* Lecteur vidéo */}
      {videoUrl && (
        <Card>
          <CardContent className="p-2">
            <video
              src={videoUrl}
              controls
              preload="metadata"
              className="max-h-[420px] w-full rounded-lg bg-black"
              poster=""
            />
          </CardContent>
        </Card>
      )}

      {/* Possession */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Possession de balle</p>
            <span className="text-xs text-muted-foreground">
              {formatVideoDuration(stats.possession.measured_sec)} mesurés
            </span>
          </div>
          <div className="flex h-8 w-full overflow-hidden rounded-lg">
            <div
              className="flex items-center justify-center text-[11px] font-bold text-white"
              style={{ width: `${stats.possession.team1}%`, backgroundColor: t1.color }}
            >
              {stats.possession.team1 > 8 && `${stats.possession.team1}%`}
            </div>
            <div
              className="flex items-center justify-center text-[11px] font-bold text-white"
              style={{ width: `${stats.possession.team2}%`, backgroundColor: t2.color }}
            >
              {stats.possession.team2 > 8 && `${stats.possession.team2}%`}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: t1.color }}
              />
              {t1.label}
            </span>
            <span className="flex items-center gap-1.5">
              {t2.label}
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: t2.color }}
              />
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Cartes stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Play}
          label="Passes"
          team1Color={t1.color}
          team2Color={t2.color}
          team1={stats.passes.team1}
          team2={stats.passes.team2}
        />
        <StatCard
          icon={Crosshair}
          label="Tirs"
          team1Color={t1.color}
          team2Color={t2.color}
          team1={stats.shots.team1}
          team2={stats.shots.team2}
        />
        <StatCard
          icon={Target}
          label="Tirs cadrés"
          team1Color={t1.color}
          team2Color={t2.color}
          team1={stats.shots_on_target.team1}
          team2={stats.shots_on_target.team2}
        />
      </div>

      {/* Timeline */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Temps forts</p>
            <span className="text-xs text-muted-foreground">
              {totalShots} tir{totalShots > 1 ? "s" : ""} · {totalShotsOnTarget}{" "}
              cadré{totalShotsOnTarget > 1 ? "s" : ""}
            </span>
          </div>
          {timeline.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucun tir détecté sur cette vidéo.
            </p>
          ) : (
            <ol className="space-y-2">
              {timeline.map((evt, i) => {
                const team = evt.team === "team1" ? t1 : t2;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg bg-muted/40 p-2.5"
                  >
                    <div
                      className="mt-0.5 flex h-7 w-16 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                      style={{ backgroundColor: team.color }}
                    >
                      {formatVideoTime(evt.t)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {evt.type === "goal" ? "🎯 But probable" : "Tir"}
                        {evt.on_target && (
                          <Badge className="bg-green-100 text-green-700">Cadré</Badge>
                        )}
                        <span className="text-xs text-muted-foreground font-normal">
                          {team.label}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{evt.note}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Métadonnées */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatVideoDuration(meta.duration_sec)}
        </span>
        <span className="flex items-center gap-1">
          <Maximize2 className="h-3 w-3" /> {meta.width}×{meta.height}
        </span>
        <span className="flex items-center gap-1">
          <Video className="h-3 w-3" /> {job.model_version || "YOLO"}
        </span>
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  team1,
  team2,
  team1Color,
  team2Color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  team1: number;
  team2: number;
  team1Color: string;
  team2Color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="h-4 w-4" /> {label}
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold" style={{ color: team1Color }}>
              {team1}
            </p>
            <p className="text-[10px] text-muted-foreground">Équipe 1</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: team2Color }}>
              {team2}
            </p>
            <p className="text-[10px] text-muted-foreground">Équipe 2</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}