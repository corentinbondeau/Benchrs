import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/api-auth";

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const clubId = searchParams.get("clubId");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!clubId || !start || !end) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: teams } = await admin.from("teams").select("id, name").eq("club_id", clubId);
    const teamIds = (teams || []).map((t) => t.id);
    if (teamIds.length === 0) {
      return NextResponse.json({ teams: [], events: [] });
    }

    const { data: events } = await admin
      .from("events")
      .select("id, team_id, type, title, opponent, event_date, location, status, score_us, score_them, match_result")
      .in("team_id", teamIds)
      .eq("type", "match")
      .neq("status", "cancelled")
      .gte("event_date", start)
      .lt("event_date", end)
      .order("event_date", { ascending: true });

    return NextResponse.json({ teams: teams || [], events: events || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
