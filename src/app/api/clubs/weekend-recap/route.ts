import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { sendPushDirect } from "@/lib/send-push-direct";

export const dynamic = "force-dynamic";

/**
 * Envoie aux familles du club le récap du week-end : tous les matchs des
 * équipes du club entre `weekStart` et `weekStart + 7 jours`.
 * Accessible au comité OU au coach/owner d'une équipe du club.
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized("unauthorized");

  if (!rateLimit(`club-weekend:${clientKey(req)}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { clubId, weekStart } = (body || {}) as { clubId?: string; weekStart?: string };
  if (!clubId || !weekStart) {
    return NextResponse.json({ error: "clubId et weekStart requis" }, { status: 400 });
  }
  const start = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "weekStart invalide" }, { status: 400 });
  }
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);

  const supabase = createAdminClient();

  // Validateur : comité du club OU coach/owner d'au moins une équipe du club.
  const { data: membership } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .eq("role", "comite")
    .maybeSingle();
  const isCommitte = !!membership;

  const { data: teamsData } = await supabase.from("teams").select("id, name").eq("club_id", clubId);
  const teams = ((teamsData || []) as { id: string; name: string }[]).map((t) => t.id);
  if (teams.length === 0) {
    return NextResponse.json({ error: "Club sans équipe" }, { status: 400 });
  }

  if (!isCommitte) {
    const { data: mine } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .in("team_id", teams)
      .in("role", ["coach", "owner"]);
    if (!mine || mine.length === 0) return forbidden();
  }

  // Matchs de la semaine (tous statuts, triés par date).
  const { data: eventsData, error: evErr } = await supabase
    .from("events")
    .select("id, team_id, title, opponent, event_date, location, status, score_us, score_them")
    .in("team_id", teams)
    .eq("type", "match")
    .gte("event_date", start.toISOString())
    .lt("event_date", end.toISOString())
    .order("event_date", { ascending: true });
  if (evErr) {
    return NextResponse.json({ error: "Erreur de lecture des matchs" }, { status: 500 });
  }
  const events = (eventsData || []) as {
    id: string;
    team_id: string;
    title: string;
    opponent: string | null;
    event_date: string;
    location: string | null;
    status: "upcoming" | "ongoing" | "completed" | "cancelled";
    score_us: number | null;
    score_them: number | null;
  }[];

  const teamNames = new Map(
    ((teamsData || []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
  );

  const plurPerTeam = new Map<string, string[]>();
  const lines: string[] = [];
  for (const ev of events) {
    const day = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(ev.event_date)
    );
    const hour = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(
      new Date(ev.event_date)
    );
    const opponent = ev.opponent?.trim() || ev.title.trim() || "Match";
    const loc = ev.location ? ` · ${ev.location}` : "";
    const score =
      ev.status === "completed" && ev.score_us != null
        ? ` · ${ev.score_us}-${ev.score_them ?? 0}`
        : ev.status === "cancelled"
          ? " (annulé)"
          : "";
    const line = `${teamNames.get(ev.team_id) ?? "Équipe"} — ${opponent} · ${day} ${hour}${loc}${score}`;
    lines.push(line);
    if (!plurPerTeam.has(ev.team_id)) plurPerTeam.set(ev.team_id, []);
    plurPerTeam.get(ev.team_id)!.push(line);
  }

  // Destinataires : joueurs actifs + parents de toutes les équipes du club.
  const [{ data: members }, { data: links }] = await Promise.all([
    supabase.from("team_members").select("user_id, team_id").in("team_id", teams).eq("role", "player"),
    supabase.from("parent_student").select("parent_id, team_id").in("team_id", teams),
  ]);

  const userTeams = new Map<string, string>();
  for (const m of members || []) {
    if (!userTeams.has(m.user_id)) userTeams.set(m.user_id, m.team_id);
  }
  for (const l of links || []) {
    if (!userTeams.has(l.parent_id)) userTeams.set(l.parent_id, l.team_id);
  }

  const title = plurPerTeam.size > 0
    ? `Week-end : ${plurPerTeam.size} match${plurPerTeam.size > 1 ? "s" : ""}`
    : "Aucun match ce week-end";
  const notifBody = lines.slice(0, 12).join("\n") || "Pas de match programmé pour ce week-end.";

  if (userTeams.size > 0) {
    const now = new Date().toISOString();
    const { error: notifErr } = await supabase.from("notifications").insert(
      [...userTeams.entries()].map(([uid, tid]) => ({
        user_id: uid,
        team_id: tid,
        type: "club_weekend",
        title,
        body: notifBody,
        url: "/club/week-end",
        scheduled_for: now,
        delivered_at: now,
      }))
    );
    if (notifErr) console.error("[clubs/weekend-recap] notif error:", notifErr);

    try {
      await sendPushDirect(supabase, [...userTeams.keys()], {
        title,
        body: notifBody,
        url: "/club/week-end",
      });
    } catch (pushErr) {
      console.error("[clubs/weekend-recap] push error:", pushErr);
    }
  }

  return NextResponse.json({ ok: true, count: events.length, recipients: userTeams.size });
}