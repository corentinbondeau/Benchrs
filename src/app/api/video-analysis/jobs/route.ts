import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthUser,
  unauthorized,
  isTeamMember,
  forbidden,
} from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const MAX_TITLE = 120;
const MAX_SIZE = 1073741824; // 1 Go

// POST /api/video-analysis/jobs
// Crée une tâche d'analyse après upload de la vidéo dans Storage.
// Le path storage est validé (dossier = match_videos/<team>/<user>/)
// pour empêcher d'analyser un fichier placé hors de son périmètre.
export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { teamId, title, storagePath, fileName, mimeType, sizeBytes, eventId } =
      await req.json();

    if (!teamId || !storagePath || typeof storagePath !== "string") {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }
    if (!(await isTeamMember(user.id, teamId))) return forbidden();

    // Le chemin doit appartenir au dossier de upload de l'utilisateur.
    const prefix = `match_videos/${teamId}/${user.id}/`;
    if (!storagePath.startsWith(prefix)) {
      return NextResponse.json(
        { error: "Chemin de stockage invalide" },
        { status: 400 }
      );
    }

    if (title && (typeof title !== "string" || title.length > MAX_TITLE)) {
      return NextResponse.json({ error: "Titre invalide" }, { status: 400 });
    }
    if (sizeBytes && (typeof sizeBytes !== "number" || sizeBytes > MAX_SIZE)) {
      return NextResponse.json({ error: "Fichier trop volumineux" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: job, error } = await supabase
      .from("video_analyses")
      .insert({
        team_id: teamId,
        event_id: eventId || null,
        created_by: user.id,
        title: title?.trim() || "Analyse vidéo",
        storage_path: storagePath,
        file_name: fileName || null,
        mime_type: mimeType || null,
        size_bytes: sizeBytes || null,
        status: "pending",
        progress: 0,
      })
      .select()
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: error?.message || "Erreur lors de la création de la tâche" },
        { status: 500 }
      );
    }

    return NextResponse.json({ job });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}

// GET /api/video-analysis/jobs?teamId=<id>
// Liste les analyses d'une équipe (le front s'abonne par ailleurs en
// realtime pour les mises à jour de statut/progress).
export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const teamId = new URL(req.url).searchParams.get("teamId");
    if (!teamId) {
      return NextResponse.json({ error: "teamId requis" }, { status: 400 });
    }
    if (!(await isTeamMember(user.id, teamId))) return forbidden();

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("video_analyses")
      .select("*, created_by_profile:profiles!video_analyses_created_by_fkey(first_name,last_name)")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ jobs: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}