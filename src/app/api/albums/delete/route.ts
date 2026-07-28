import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { albumId } = await req.json();
    if (!albumId) {
      return NextResponse.json({ error: "Album ID required" }, { status: 400 });
    }

    const supabase = createAdminClient();

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
