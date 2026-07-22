import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  if (!eventId) {
    return NextResponse.json({ error: "event_id requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("match_lineups")
    .select("*, player:profiles!match_lineups_player_id_fkey(id, first_name, last_name, shirt_number, position)")
    .eq("event_id", eventId)
    .order("is_starter", { ascending: false })
    .order("position_label");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json();
  const { event_id, lineups } = body;

  if (!event_id || !Array.isArray(lineups)) {
    return NextResponse.json({ error: "event_id et lineups requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("match_lineups")
    .delete()
    .eq("event_id", event_id);

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  const rows = lineups.map((l: { player_id: string; position_label: string | null; is_starter: boolean }) => ({
    event_id,
    player_id: l.player_id,
    position_label: l.position_label,
    is_starter: l.is_starter,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("match_lineups")
      .insert(rows);

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
