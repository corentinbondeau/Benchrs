import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { mediaId, mediaIds } = await req.json();
    const ids = mediaIds || (mediaId ? [mediaId] : []);

    if (ids.length === 0) {
      return NextResponse.json({ error: "Media ID(s) required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: mediaList, error: fetchError } = await supabase
      .from("gallery_media")
      .select("id, storage_path")
      .in("id", ids);

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const paths = mediaList?.map((m) => m.storage_path).filter(Boolean) as string[];
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
