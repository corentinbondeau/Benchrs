"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signedStorageUrl } from "@/lib/storage";
import {
  VideoAnalysis,
  VideoAnalysisResult,
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
  // Le result vient de la base et peut être partiel (anciennes analyses) :
  // on normalise chaque bloc avec des valeurs par défaut pour éviter tout
  // accès sur `undefined` au rendu.
  const result = job.result as Partial<VideoAnalysisResult>;
  const possession = result.stats?.possession ?? { team1: 0, team2: 0, measured_sec: 0 };
  const passes = result.stats?.passes ?? { team1: 0, team2: 0 };
  const shots = result.stats?.shots ?? { team1: 0, team2: 0 };
  const shotsOnTarget = result.stats?.shots_on_target ?? { team1: 0, team2: 0 };
  const physical = result.stats?.physical;
  const structure = result.stats?.structure;
  const pressure = result.stats?.pressure;
  const possessionTimeline = Array.isArray(result.possession_timeline)
    ? result.possession_timeline
    : [];
  const timeline = Array.isArray(result.timeline) ? result.timeline : [];
  const meta = result.meta;
  const t1 = result.teams?.team1 ?? { label: "Équipe 1", color: "#3b82f6" };
  const t2 = result.teams?.team2 ?? { label: "Équipe 2", color: "#ef4444" };
  const totalShots = shots.team1 + shots.team2;
  const totalShotsOnTarget = shotsOnTarget.team1 + shotsOnTarget.team2;
  const videoDuration = meta?.duration_sec ?? 0;

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
              {formatVideoDuration(possession.measured_sec)} mesurés
            </span>
          </div>
          <div className="flex h-8 w-full overflow-hidden rounded-lg">
            <div
              className="flex items-center justify-center text-[11px] font-bold text-white"
              style={{ width: `${possession.team1}%`, backgroundColor: t1.color }}
            >
              {possession.team1 > 8 && `${possession.team1}%`}
            </div>
            <div
              className="flex items-center justify-center text-[11px] font-bold text-white"
              style={{ width: `${possession.team2}%`, backgroundColor: t2.color }}
            >
              {possession.team2 > 8 && `${possession.team2}%`}
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
          {/* Chronologie de la possession : segments fusionnés sur la durée
              de la vidéo (lecture « qui a tenu le ballon quand »). */}
          {possessionTimeline.length > 0 && videoDuration > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                Chronologie
              </p>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                {possessionTimeline.map((seg, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full"
                    style={{
                      left: `${Math.max(0, (seg.t0 / videoDuration) * 100)}%`,
                      width: `${Math.max(0.5, ((seg.t1 - seg.t0) / videoDuration) * 100)}%`,
                      backgroundColor:
                        seg.team === "team1" ? t1.color : t2.color,
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0:00</span>
                <span>{formatVideoTime(videoDuration)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Physique & structure (analyses récentes uniquement) */}
      {(physical || structure || pressure) && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <p className="text-sm font-semibold">
              Physique &amp; structure
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                estimation — comparative entre équipes
              </span>
            </p>
            {physical && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Physique
                </p>
                <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
                  <MetricRow
                    header=""
                    v1={`${physical.team1.distance_km.toFixed(2)} km`}
                    v2={`${physical.team2.distance_km.toFixed(2)} km`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Haute int."
                    v1={`${physical.team1.high_intensity_km.toFixed(2)} km`}
                    v2={`${physical.team2.high_intensity_km.toFixed(2)} km`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Vitesse moy."
                    v1={`${physical.team1.speed_avg_kmh.toFixed(1)} km/h`}
                    v2={`${physical.team2.speed_avg_kmh.toFixed(1)} km/h`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Vitesse max"
                    v1={`${physical.team1.speed_max_kmh.toFixed(1)} km/h`}
                    v2={`${physical.team2.speed_max_kmh.toFixed(1)} km/h`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Tracks"
                    v1={`${physical.team1.players_tracked}`}
                    v2={`${physical.team2.players_tracked}`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                </div>
              </div>
            )}
            {structure && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Structure du bloc
                </p>
                <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
                  <MetricRow
                    header="Profondeur"
                    v1={`${structure.team1.depth_m.toFixed(1)} m`}
                    v2={`${structure.team2.depth_m.toFixed(1)} m`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Largeur"
                    v1={`${structure.team1.width_m.toFixed(1)} m`}
                    v2={`${structure.team2.width_m.toFixed(1)} m`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Compacité"
                    v1={`${structure.team1.compactness_m.toFixed(1)} m`}
                    v2={`${structure.team2.compactness_m.toFixed(1)} m`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Joueurs visibles"
                    v1={`${structure.team1.players_visible_avg.toFixed(1)}`}
                    v2={`${structure.team2.players_visible_avg.toFixed(1)}`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                </div>
              </div>
            )}
            {pressure && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Pression (distance au ballon)
                </p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <MetricRow
                    header="Dist. moy."
                    v1={`${pressure.team1.avg_dist_m.toFixed(1)} m`}
                    v2={`${pressure.team2.avg_dist_m.toFixed(1)} m`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                  <MetricRow
                    header="Sur le ballon"
                    v1={`${pressure.team1.near_ball_avg.toFixed(1)}`}
                    v2={`${pressure.team2.near_ball_avg.toFixed(1)}`}
                    c1={t1.color}
                    c2={t2.color}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cartes stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Play}
          label="Passes"
          team1Color={t1.color}
          team2Color={t2.color}
          team1={passes.team1}
          team2={passes.team2}
        />
        <StatCard
          icon={Crosshair}
          label="Tirs"
          team1Color={t1.color}
          team2Color={t2.color}
          team1={shots.team1}
          team2={shots.team2}
        />
        <StatCard
          icon={Target}
          label="Tirs cadrés"
          team1Color={t1.color}
          team2Color={t2.color}
          team1={shotsOnTarget.team1}
          team2={shotsOnTarget.team2}
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
                      {formatVideoTime(evt.t ?? 0)}
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
          <Clock className="h-3 w-3" /> {formatVideoDuration(meta?.duration_sec)}
        </span>
        <span className="flex items-center gap-1">
          <Maximize2 className="h-3 w-3" /> {meta?.width ?? "?"}×{meta?.height ?? "?"}
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

function MetricRow({
  header,
  v1,
  v2,
  c1,
  c2,
}: {
  header: string;
  v1: string;
  v2: string;
  c1: string;
  c2: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{header}</p>
      <p className="text-sm font-bold" style={{ color: c1 }}>
        {v1}
      </p>
      <p className="text-sm font-bold" style={{ color: c2 }}>
        {v2}
      </p>
    </div>
  );
}