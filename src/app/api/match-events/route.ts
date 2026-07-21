import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth/config";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("match_events")
    .select("*, player:profiles!match_events_player_id_fkey(first_name, last_name, shirt_number), related_player:profiles!match_events_related_player_id_fkey(first_name, last_name)")
    .eq("event_id", eventId)
    .order("minute", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const body = await request.json();
  const { event_id, event_type, player_id, related_player_id, minute, notes } = body;

  if (!event_id || !event_type) {
    return NextResponse.json({ error: "event_id et event_type requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("match_events")
    .insert({
      event_id,
      event_type,
      player_id: player_id || null,
      related_player_id: related_player_id || null,
      minute: minute || null,
      notes: notes || null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("match_events").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
