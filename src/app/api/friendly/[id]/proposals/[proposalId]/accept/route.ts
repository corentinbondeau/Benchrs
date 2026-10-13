import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  const { id, proposalId } = await params;
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: match } = await supabase.from("friendly_matches").select("organizer_id").eq("id", id).single();
  if (!match) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // L'organisateur de l'annonce est le seul à accepter une proposition.
  if (match.organizer_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: proposal } = await supabase.from("friendly_proposals").select("team_id, coach_id").eq("id", proposalId).single();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  await supabase.from("friendly_proposals").update({ status: "declined" }).eq("friendly_id", id).neq("id", proposalId);
  await supabase.from("friendly_proposals").update({ status: "accepted" }).eq("id", proposalId);
  await supabase.from("friendly_matches").update({ status: "accepted", accepted_by_team_id: proposal.team_id, accepted_by_coach_id: proposal.coach_id, accepted_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ ok: true });
}
