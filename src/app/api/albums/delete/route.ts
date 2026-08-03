import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { albumId } = await req.json();
    if (!albumId) {
      return NextResponse.json({ error: "Album ID required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: album } = await supabase
      .from("albums")
      .select("id, team_id")
      .eq("id", albumId)
      .maybeSingle();

    if (!album) {
      return NextResponse.json({ error: "Album introuvable" }, { status: 404 });
    }

    if (!(await isTeamCoach(user.id, album.team_id))) {
      return forbidden();
    }

    const { error: deleteError } = await supabase
      .from("albums")
      .delete()
      .eq("id", albumId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
