import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar/ics";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const teamId = url.searchParams.get("team");
  const token = url.searchParams.get("token");
  const download = url.searchParams.get("download") === "1";

  if (!teamId || !token) {
    return new NextResponse("Paramètres manquants", { status: 400 });
  }

  const admin = createAdminClient();

  const { data: team } = await admin
    .from("teams")
    .select("id, name, ics_token")
    .eq("id", teamId)
    .maybeSingle();

  if (!team || !team.ics_token || team.ics_token !== token) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const { data: events } = await admin
    .from("events")
    .select("id, type, title, description, event_date, end_date, location, opponent, status")
    .eq("team_id", teamId)
    .order("event_date", { ascending: true });

  const icsEvents: IcsEvent[] = (events || []).map((e) => {
    const start = new Date(e.event_date);
    const isMatch = e.type === "match";
    const fallbackEnd = new Date(start.getTime() + (isMatch ? 2 * 60 * 60 * 1000 : 90 * 60 * 1000));
    const end = e.end_date ? new Date(e.end_date) : fallbackEnd;

    const summary = e.title || (isMatch ? "Match" : "Entraînement");
    const description = [
      isMatch && e.opponent ? `Adversaire : ${e.opponent}` : "",
      e.description ? e.description : "",
    ]
      .filter(Boolean)
      .join("\\n");

    return {
      uid: `benchrs-${teamId}-${e.id}@benchrs`,
      start,
      end,
      summary,
      description,
      location: e.location ?? "",
      status: e.status === "cancelled" ? ("CANCELLED" as const) : ("CONFIRMED" as const),
    };
  });

  const ics = buildIcsCalendar(`Benchrs ${team.name}`, icsEvents);

  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (download) {
    const slug = team.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "equipe";
    headers["Content-Disposition"] = `attachment; filename="calendrier-${slug}.ics"`;
  }

  return new NextResponse(ics, { headers });
}
