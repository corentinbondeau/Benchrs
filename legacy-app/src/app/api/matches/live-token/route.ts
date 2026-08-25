import { NextResponse } from "next/server";
import { getAuthUserDetailed, unauthorized, forbidden } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);
  const { eventId, regenerate } = await req.json();

  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "eventId manquant" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, team_id, type, live_token")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  if (event.type !== "match") {
    return NextResponse.json({ error: "Le score live ne concerne que les matchs" }, { status: 400 });
  }

  const roleRes = await admin.from("team_members").select("role").eq("user_id", user.id).eq("team_id", event.team_id).maybeSingle();
  const role = roleRes.data?.role as string | null;
  if (!role || (role !== "owner" && role !== "coach")) return forbidden();

  const token = event.live_token && !regenerate ? event.live_token : randomUUID();

  if (!event.live_token || regenerate) {
    await admin.from("events").update({ live_token: token }).eq("id", eventId);
  }

  return NextResponse.json({ liveToken: token });
}
