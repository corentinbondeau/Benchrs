import { NextResponse } from "next/server";
import { getAuthUserDetailed, forbidden, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTeamCoach } from "@/lib/api-auth";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_TONES,
  generateAnnouncement,
  type AnnouncementAudience,
  type AnnouncementTone,
} from "@/lib/announcements/ai-generator";

const VALID_POINTS = ["horaire", "equipement", "reponse", "covoiturage", "lieu"];

export async function POST(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);

  const teamId = typeof body?.teamId === "string" ? body.teamId : "";
  if (!teamId) return NextResponse.json({ error: "teamId manquant" }, { status: 400 });

  if (!(await isTeamCoach(user.id, teamId))) return forbidden();

  const type = body?.type === "convocation" ? "convocation" : "info";

  const audience: AnnouncementAudience =
    typeof body?.audience === "string" &&
    (ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(body.audience)
      ? (body.audience as AnnouncementAudience)
      : "joueurs";

  const tone: AnnouncementTone =
    typeof body?.tone === "string" &&
    (ANNOUNCEMENT_TONES as readonly string[]).includes(body.tone)
      ? (body.tone as AnnouncementTone)
      : "motivant";

  const topic =
    typeof body?.topic === "string" ? body.topic.trim().slice(0, 500) : "";

  const points = Array.isArray(body?.points)
    ? body.points
        .filter((p: unknown): p is string => typeof p === "string" && VALID_POINTS.includes(p))
        .slice(0, 4)
    : [];

  if (type === "info" && !topic) {
    return NextResponse.json({ error: "Décris le sujet de l'information" }, { status: 400 });
  }

  const admin = createAdminClient();

  let event: Awaited<ReturnType<typeof fetchEvent>> | null = null;
  if (type === "convocation") {
    const eventId = typeof body?.eventId === "string" ? body.eventId : "";
    if (!eventId) {
      return NextResponse.json({ error: "Sélectionne un événement" }, { status: 400 });
    }
    event = await fetchEvent(admin, eventId, teamId);
    if (!event) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }
  }

  try {
    const text = await generateAnnouncement({
      type,
      audience,
      tone,
      event,
      topic,
      points,
    });
    return NextResponse.json({ text });
  } catch (e) {
    console.error("[announcements/generate] échec IA:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function fetchEvent(
  admin: AdminClient,
  eventId: string,
  teamId: string
): Promise<{
  eventId: string;
  eventType: string;
  title: string;
  eventDate: string;
  meetingTime: string | null;
  location: string | null;
  opponent: string | null;
  description: string | null;
  teamName: string;
  playersCount: number;
} | null> {
  const { data: event } = await admin
    .from("events")
    .select("*")
    .eq("id", eventId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!event) return null;

  const { data: team } = await admin
    .from("teams")
    .select("name")
    .eq("id", teamId)
    .maybeSingle();

  const { count } = await admin
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("role", "player");

  return {
    eventId,
    eventType: event.type,
    title: event.title,
    eventDate: event.event_date,
    meetingTime: event.meeting_time ?? null,
    location: event.location ?? null,
    opponent: event.opponent ?? null,
    description: event.description ?? null,
    teamName: team?.name ?? "",
    playersCount: count ?? 0,
  };
}
