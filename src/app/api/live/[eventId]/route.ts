import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, team_id, title, opponent, location, event_date, status, score_us, score_them, match_started_at, match_ended_at, match_halftime_at, match_resumed_at, live_token, teams(name)")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || !event.live_token || event.live_token !== token) {
    return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 404 });
  }

  const teamRaw = event.teams as { name: string }[] | null;
  const team = teamRaw?.[0] ?? null;

  // Charger la durée de mi-temps configurée pour l'équipe
  const { data: settings } = await admin
    .from("team_settings")
    .select("half_duration")
    .eq("team_id", event.team_id)
    .maybeSingle();
  const halfDuration = (settings as { half_duration?: number } | null)?.half_duration ?? 45;

  // Charger les données enrichies du match en parallèle
  const [eventsRes, playersRes, statsRes, lineupsRes] = await Promise.all([
    admin
      .from("match_events")
      .select("event_type, player_id, related_player_id, minute, notes")
      .eq("event_id", eventId)
      .eq("team_id", event.team_id)
      .order("minute", { ascending: true, nullsFirst: false }),
    admin
      .from("team_members")
      .select("profiles!inner(id, first_name, last_name, shirt_number)")
      .eq("team_id", event.team_id),
    admin
      .from("match_stats")
      .select("player_id, goals, assists, yellow_cards, red_cards, minutes_played")
      .eq("event_id", eventId)
      .eq("team_id", event.team_id),
    admin
      .from("match_lineups")
      .select("player_id, position, is_starter")
      .eq("event_id", eventId)
      .eq("team_id", event.team_id),
  ]);

  return NextResponse.json({
    id: event.id,
    teamName: team?.name ?? "Équipe",
    title: event.title || "Match",
    opponent: event.opponent,
    location: event.location,
    eventDate: event.event_date,
    status: event.status,
    scoreUs: event.score_us,
    scoreThem: event.score_them,
    startedAt: event.match_started_at,
    endedAt: event.match_ended_at,
    halftimeAt: event.match_halftime_at,
    resumedAt: event.match_resumed_at,
    halfDuration,
    events: eventsRes.data || [],
    players: playersRes.data?.map((m) => (m as { profiles: unknown }).profiles) || [],
    stats: statsRes.data || [],
    lineups: lineupsRes.data || [],
  });
}
