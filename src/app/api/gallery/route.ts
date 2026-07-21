import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: media, error } = await supabase
    .from("gallery_media")
    .select("*, event:events!gallery_media_event_id_fkey(id, title, event_date), uploader:profiles!gallery_media_uploaded_by_fkey(first_name, last_name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ media });
}
