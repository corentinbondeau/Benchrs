"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import {
  VideoAnalysis,
  formatVideoDuration,
  formatVideoSize,
  videoAnalysisStatusLabel,
} from "@/lib/videoAnalysis";
import { VideoAnalysisUploader } from "@/components/video/VideoAnalysisUploader";
import { MatchVideoDashboard } from "@/components/video/MatchVideoDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { ChevronRight, Clapperboard, Loader2, Trash2 } from "lucide-react";

export default function VideoAnalysisPage() {
  const { currentTeam, userRole } = useTeam();
  const { user } = useAuth();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [jobs, setJobs] = useState<VideoAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const instanceId = useId();

  const loadJobs = useCallback(async () => {
    if (!currentTeam) return [] as VideoAnalysis[];
    const supabase = createClient();
    const { data, error } = await supabase
      .from("video_analyses")
      .select("*, created_by_profile:profiles!video_analyses_created_by_fkey(first_name,last_name)")
      .eq("team_id", currentTeam.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as VideoAnalysis[]) || [];
  }, [currentTeam]);

  useEffect(() => {
    if (!currentTeam) return;
    let active = true;

    loadJobs()
      .then((rows) => {
        if (!active) return;
        setJobs(rows);
        setLoading(false);
        if (!rows.find((j) => j.id === selectedId)) setSelectedId(null);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
        toast.error("Impossible de charger les analyses");
      });

    // Realtime : le worker met à jour status/progress/result en continu.
    const supabase = createClient();
    const channel = supabase
      .channel(`video-analysis:${currentTeam.id}:${instanceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_analyses",
          filter: `team_id=eq.${currentTeam.id}`,
        },
        () => {
          loadJobs()
            .then((rows) => {
              if (!active) return;
              setJobs(rows);
              setLoading(false);
            })
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
    // selectedId n'est volontairement pas dans les deps (reloads ci-dessus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeam, loadJobs, instanceId]);

  if (!currentTeam) return null;

  async function handleDelete(job: VideoAnalysis) {
    if (!window.confirm(`Supprimer l'analyse « ${job.title} » et sa vidéo ?`)) return;
    const res = await authFetch(`/api/video-analysis/jobs/${job.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok || data.error) {
      toast.error(data.error || "Erreur lors de la suppression");
      return;
    }
    setJobs((prev) => prev.filter((j) => j.id !== job.id));
    if (selectedId === job.id) setSelectedId(null);
    toast.success("Analyse supprimée");
  }

  const selectedJob = jobs.find((j) => j.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Clapperboard className="h-5 w-5 text-[var(--color-royal)]" />
          Analyse vidéo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importe la vidéo d&apos;un match : un service IA (YOLO + suivi multi-objets)
          calcule possession, passes, tirs et tirs cadrés, puis dresse la
          timeline des temps forts.
        </p>
      </div>

      <VideoAnalysisUploader
        teamId={currentTeam.id}
        onCreated={() => loadJobs().then(setJobs).catch(() => {})}
      />

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Analyses de l&apos;équipe
        </h2>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
            title="Aucune analyse"
            description="Importe la vidéo d'un match pour générer le premier rapport IA."
          />
        ) : (
          jobs.map((job) => {
            const open = selectedId === job.id;
            const canDelete = isCoach || job.created_by === user?.id;
            return (
              <Card key={job.id} className={open ? "ring-2 ring-[var(--color-gold)]" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedId(open ? null : job.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <StatusDot status={job.status} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{job.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {job.created_by_profile?.first_name}{" "}
                          {job.created_by_profile?.last_name} ·{" "}
                          {new Date(job.created_at).toLocaleDateString("fr-FR")} ·{" "}
                          {formatVideoSize(job.size_bytes)} ·{" "}
                          {formatVideoDuration(job.result?.meta.duration_sec ?? null)}
                        </p>
                        {job.status === "processing" && (
                          <div className="mt-2 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[var(--color-gold)] transition-all"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={job.status === "completed" ? "default" : "secondary"}
                        className={
                          job.status === "failed"
                            ? "bg-red-100 text-red-700"
                            : job.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : undefined
                        }
                      >
                        {videoAnalysisStatusLabel(job.status)}
                        {job.status === "processing" ? ` · ${job.progress}%` : ""}
                      </Badge>
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                          open ? "rotate-90" : ""
                        }`}
                      />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        aria-label="Supprimer l'analyse"
                        title="Supprimer"
                        onClick={() => handleDelete(job)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {open && selectedJob && (
                    <div className="mt-4 border-t pt-4">
                      <MatchVideoDashboard job={selectedJob} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

// Petit composant : pastille d'état colorée
function StatusDot({ status }: { status: VideoAnalysis["status"] }) {
  const color =
    status === "completed"
      ? "bg-green-500"
      : status === "failed"
      ? "bg-red-500"
      : status === "processing"
      ? "bg-[var(--color-gold)] animate-pulse"
      : "bg-muted-foreground";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}