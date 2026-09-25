// Types et helpers du module "Analyse vidéo" (analyse de match par IA).

export type VideoAnalysisStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";

export interface VideoAnalysisTeamColor {
  label: string;
  color: string;
}

export interface VideoAnalysisTimelineEvent {
  t: number; // secondes depuis le début de la vidéo
  type: "shot" | "goal";
  team: "team1" | "team2";
  on_target: boolean;
  note: string;
}

export interface VideoAnalysisResult {
  schema_version: number;
  model: string;
  meta: {
    fps: number;
    width: number;
    height: number;
    frames: number;
    duration_sec: number;
    analyzed_frames: number;
  };
  teams: {
    team1: VideoAnalysisTeamColor;
    team2: VideoAnalysisTeamColor;
  };
  stats: {
    possession: { team1: number; team2: number; measured_sec: number };
    passes: { team1: number; team2: number };
    shots: { team1: number; team2: number };
    shots_on_target: { team1: number; team2: number };
  };
  timeline: VideoAnalysisTimelineEvent[];
}

export interface VideoAnalysis {
  id: string;
  team_id: string;
  event_id: string | null;
  created_by: string;
  title: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: VideoAnalysisStatus;
  progress: number;
  error: string | null;
  result: VideoAnalysisResult | null;
  model_version: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_profile?: {
    first_name: string;
    last_name: string;
  } | null;
}

const STATUS_LABELS: Record<VideoAnalysisStatus, string> = {
  pending: "En attente",
  processing: "En cours d'analyse",
  completed: "Terminée",
  failed: "Échec",
  canceled: "Annulée",
};

export function videoAnalysisStatusLabel(status: VideoAnalysisStatus): string {
  return STATUS_LABELS[status];
}

export function formatVideoDuration(sec?: number | null): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m <= 0) return `${s} s`;
  return `${m} min ${s}s`;
}

export function formatVideoTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatVideoSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} Mo`;
  return `${(mb / 1024).toFixed(2)} Go`;
}