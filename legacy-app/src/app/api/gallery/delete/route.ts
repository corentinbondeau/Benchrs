import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { mediaId, mediaIds } = await req.json();
    const ids = mediaIds || (mediaId ? [mediaId] : []);

    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      return NextResponse.json({ error: "Media ID(s) required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: mediaList, error: fetchError } = await supabase
      .from("gallery_media")
      .select("id, storage_path, team_id, uploaded_by")
      .in("id", ids);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!mediaList || mediaList.length !== ids.length) {
      return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
    }

    const teamIds = [...new Set(mediaList.map((m) => m.team_id as string | null).filter(Boolean))];
    for (const teamId of teamIds) {
      const isCoach = await isTeamCoach(user.id, teamId as string);
      if (!isCoach) {
        const uploadedOwn = mediaList
          .filter((m) => m.team_id === teamId)
          .every((m) => m.uploaded_by === user.id);
        if (!uploadedOwn) return forbidden();
      }
    }

    const paths = mediaList.map((m) => m.storage_path).filter(Boolean) as string[];
    if (paths.length > 0) {
      await supabase.storage.from("gallery").remove(paths);
    }

    const { error: deleteError } = await supabase
      .from("gallery_media")
      .delete()
      .in("id", ids);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
