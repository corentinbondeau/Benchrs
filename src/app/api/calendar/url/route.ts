import { NextResponse } from "next/server";
import { getAuthUserDetailed, forbidden, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTeamCoach } from "@/lib/api-auth";

export async function GET(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId manquant" }, { status: 400 });

  if (!(await isTeamCoach(user.id, teamId))) return forbidden();

  const admin = createAdminClient();

  let { data: team } = await admin
    .from("teams")
    .select("id, name, ics_token")
    .eq("id", teamId)
    .maybeSingle();

  if (!team) return NextResponse.json({ error: "Équipe introuvable" }, { status: 404 });

  if (!team.ics_token) {
    const token = [...Array(32)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("");
    const { data: updated } = await admin
      .from("teams")
      .update({ ics_token: token })
      .eq("id", teamId)
      .select("ics_token")
      .single();
    team = { ...team, ics_token: updated?.ics_token ?? token };
  }

  const origin = url.origin;
  const httpsUrl = `${origin}/api/calendar/ics?team=${teamId}&token=${team.ics_token}`;
  const webcalUrl = httpsUrl.replace(/^https:/, "webcal:").replace(/^http:/, "webcal:");

  return NextResponse.json({
    teamName: team.name,
    icsUrl: httpsUrl,
    webcalUrl,
    downloadUrl: `${httpsUrl}&download=1`,
  });
}
