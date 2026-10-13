import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { team_id, message } = body;
  if (!team_id) return NextResponse.json({ error: "team_id required" }, { status: 400 });
  if (!(await isTeamCoach(user.id, team_id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("friendly_proposals").insert({
    friendly_id: id,
    team_id,
    coach_id: user.id,
    message,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
