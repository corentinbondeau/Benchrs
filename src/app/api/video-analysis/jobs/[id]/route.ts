import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET /api/video-analysis/jobs/[id]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const { id } = await params;

    const supabase = createAdminClient();
    const { data: job, error } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: "Analyse introuvable" }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("team_id", job.team_id)
      .maybeSingle();
    if (!member) return forbidden();

    return NextResponse.json({ job });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}

// DELETE /api/video-analysis/jobs/[id]
// Supprime la vidéo (storage) + la ligne. Réservé au créateur ou au coach.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const { id } = await params;

    const supabase = createAdminClient();
    const { data: job, error: fetchError } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !job) {
      return NextResponse.json(
        { error: fetchError?.message || "Analyse introuvable" },
        { status: fetchError ? 500 : 404 }
      );
    }

    const isCreator = job.created_by === user.id;
    const isCoach = !isCreator && (await isTeamCoach(user.id, job.team_id));
    if (!isCreator && !isCoach) return forbidden();

    if (job.storage_path) {
      await supabase.storage.from("match_videos").remove([job.storage_path]);
    }
    const { error: deleteError } = await supabase
      .from("video_analyses")
      .delete()
      .eq("id", id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}