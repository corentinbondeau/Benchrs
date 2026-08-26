import { NextResponse } from "next/server";
import { getAuthUser, forbidden, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { previousSeasonLabel } from "@/lib/goals";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: string };
  if (!teamId) {
    return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
  }

  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const coach = await isTeamCoach(user.id, teamId);
  if (!coach) {
    return forbidden();
  }

  const supabase = createAdminClient();
  const now = new Date();
  const targetSeason = now.getMonth() >= 7 ? `${now.getFullYear()}-${now.getFullYear() + 1}` : `${now.getFullYear() - 1}-${now.getFullYear()}`;
  const sourceSeason = previousSeasonLabel(targetSeason);

  const { data: sourceEvents, error } = await supabase
    .from("events")
    .select(
      "title, type, opponent, location, meeting_time, travel_time_min, convocation_lead_days, event_date, end_date"
    )
    .eq("team_id", teamId)
    .gte("event_date", `${sourceSeason.slice(0, 4)}-08-01T00:00:00.000Z`)
    .lt("event_date", `${sourceSeason.slice(5, 9)}-08-01T00:00:00.000Z`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!sourceEvents || sourceEvents.length === 0) {
    return NextResponse.json(
      { error: `Aucun événement trouvé sur la saison ${sourceSeason}.` },
      { status: 404 }
    );
  }

  const rows = (sourceEvents as {
    title: string;
    type: string;
    opponent: string | null;
    location: string | null;
    meeting_time: string | null;
    travel_time_min: number | null;
    convocation_lead_days: number | null;
    event_date: string;
    end_date: string | null;
  }[]).map((ev) => {
    const shifted = new Date(new Date(ev.event_date).getTime() + 365 * 24 * 60 * 60 * 1000);
    const shiftedEnd = ev.end_date
      ? new Date(new Date(ev.end_date).getTime() + 365 * 24 * 60 * 60 * 1000)
      : null;
    return {
      team_id: teamId,
      title: ev.title,
      type: ev.type,
      opponent: ev.opponent,
      location: ev.location,
      meeting_time: ev.meeting_time,
      travel_time_min: ev.travel_time_min,
      convocation_lead_days: ev.convocation_lead_days ?? 3,
      event_date: shifted.toISOString(),
      end_date: shiftedEnd ? shiftedEnd.toISOString() : null,
      status: "upcoming",
      score_us: null,
      score_them: null,
    };
  });

  const { error: insertError } = await supabase.from("events").insert(rows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    copied: rows.length,
    sourceSeason,
    targetSeason,
  });
}
