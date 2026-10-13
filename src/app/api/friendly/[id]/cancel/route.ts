import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: match } = await supabase.from("friendly_matches").select("organizer_id").eq("id", id).single();
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (match.organizer_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await supabase.from("friendly_matches").update({ status: "cancelled" }).eq("id", id);
  return NextResponse.json({ ok: true });
}
