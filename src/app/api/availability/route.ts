import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("teamId");
    const date = searchParams.get("date");
    
    const admin = createAdminClient();
    let query = admin.from("player_availability").select("player_id, start_date, end_date");
    
    if (teamId) query = query.eq("team_id", teamId);
    if (date) {
      query = query.lte("start_date", date).gte("end_date", date);
    }
    
    const { data } = await query;
    return NextResponse.json({ unavailable: data?.map(d => d.player_id) || [] });
  } catch (e) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
