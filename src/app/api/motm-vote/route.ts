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

  const { data: votes, error } = await supabase
    .from("motm_votes")
    .select("candidate_id, voter_id")
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const v of votes || []) {
    counts[v.candidate_id] = (counts[v.candidate_id] || 0) + 1;
  }

  return NextResponse.json({ votes: votes || [], counts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { event_id, candidate_id } = body;

  if (!event_id || !candidate_id) {
    return NextResponse.json({ error: "event_id et candidate_id requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase.from("motm_votes").insert({
    event_id,
    voter_id: session.user.id,
    candidate_id,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Vous avez déjà voté pour ce match" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
