import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { mediaId, albumId } = await req.json();
    if (!mediaId) {
      return NextResponse.json({ error: "Media ID required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: media } = await supabase
      .from("gallery_media")
      .select("id, team_id")
      .eq("id", mediaId)
      .maybeSingle();

    if (!media) {
      return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
    }

    if (!(await isTeamMember(user.id, media.team_id))) {
      return forbidden();
    }

    if (albumId != null && typeof albumId !== "string") {
      return NextResponse.json({ error: "Album ID invalide" }, { status: 400 });
    }

    if (albumId) {
      const { data: album } = await supabase
        .from("albums")
        .select("id")
        .eq("id", albumId)
        .eq("team_id", media.team_id)
        .maybeSingle();
      if (!album) {
        return NextResponse.json(
          { error: "Album introuvable dans cette équipe" },
          { status: 400 }
        );
      }
    }

    const { error } = await supabase
      .from("gallery_media")
      .update({ album_id: albumId || null })
      .eq("id", mediaId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
