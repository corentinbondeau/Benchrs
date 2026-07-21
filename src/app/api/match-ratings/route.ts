import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");

  if (!eventId) {
    return NextResponse.json({ error: "event_id requis" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("match_ratings")
    .select("*, player:profiles!match_ratings_player_id_fkey(id, first_name, last_name, shirt_number), rater:profiles!match_ratings_rater_id_fkey(id, first_name, last_name)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json();
  const { event_id, player_id, rating, comment } = body;

  if (!event_id || !player_id || !rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "event_id, player_id et rating (1-5) requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("match_ratings")
    .upsert({
      event_id,
      rater_id: session.user.id,
      player_id,
      rating,
      comment: comment || null,
    }, { onConflict: "event_id,rater_id,player_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
