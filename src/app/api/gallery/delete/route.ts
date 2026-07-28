import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { mediaId } = await req.json();
    if (!mediaId) {
      return NextResponse.json({ error: "Media ID required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: media, error: fetchError } = await supabase
      .from("gallery_media")
      .select("*")
      .eq("id", mediaId)
      .single();

    if (fetchError || !media) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }

    if (media.storage_path) {
      await supabase.storage.from("gallery").remove([media.storage_path]);
    }

    const { error: deleteError } = await supabase
      .from("gallery_media")
      .delete()
      .eq("id", mediaId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
