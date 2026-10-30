import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/live-score
 *
 * Webhook déclenché quand le score d'un match est mis à jour.
 * Envoie une notification push "match_live" à tous les abonnés de l'équipe.
 *
 * Body attendu : { event_id: string, score_us: number, score_them: number }
 * Auth : CRON_SECRET en Bearer (même convention que le cron principal).
 */
export async function POST(req: Request) {
  // --- Auth ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Parse body ---
  let event_id: string;
  let score_us: number;
  let score_them: number;
  try {
    const body = await req.json();
    event_id = body.event_id;
    score_us = Number(body.score_us);
    score_them = Number(body.score_them);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!event_id || typeof event_id !== "string") {
    return NextResponse.json({ error: "event_id manquant" }, { status: 400 });
  }
  if (Number.isNaN(score_us) || Number.isNaN(score_them)) {
    return NextResponse.json({ error: "score_us et score_them doivent être des nombres" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // --- Récupérer l'événement ---
  const { data: ev, error: evError } = await supabase
    .from("events")
    .select("id, team_id, title, opponent, status")
    .eq("id", event_id)
    .maybeSingle();

  if (evError || !ev) {
    return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  }

  const { team_id, title, opponent, status } = ev as {
    id: string;
    team_id: string | null;
    title: string;
    opponent: string | null;
    status: string;
  };

  if (!team_id) {
    return NextResponse.json({ error: "team_id manquant sur l'événement" }, { status: 422 });
  }

  // Seuls les matchs "ongoing" déclenchent une notification live
  if (status !== "ongoing") {
    return NextResponse.json({ ok: false, reason: "Le match n'est pas en cours (ongoing)" }, { status: 200 });
  }

  // --- Déduplique : une notif par combinaison score_us-score_them ---
  const dedupRef = `live:${event_id}:${score_us}-${score_them}`;
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("type", "match_live")
    .eq("reference_id", dedupRef)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Déjà envoyé pour ce score" });
  }

  // --- Destinataires : joueurs actifs de l'équipe + leurs parents ---
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", team_id)
    .in("role", ["player"]);

  const playerIds = ((members || []) as { user_id: string }[]).map((m) => m.user_id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .in("id", playerIds)
    .eq("is_active", true);

  const activeIds = ((profiles || []) as { id: string }[]).map((p) => p.id);

  const { data: links } = await supabase
    .from("parent_student")
    .select("parent_id")
    .eq("team_id", team_id)
    .in("student_id", activeIds);

  const parentIds = [
    ...new Set(((links || []) as { parent_id: string }[]).map((l) => l.parent_id)),
  ];

  // Inclure aussi coaches/owners qui suivent le match
  const { data: coaches } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", team_id)
    .in("role", ["owner", "coach"]);

  const coachIds = ((coaches || []) as { user_id: string }[]).map((c) => c.user_id);

  const userIds = [...new Set([...activeIds, ...parentIds, ...coachIds])];

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "Aucun abonné dans l'équipe" });
  }

  const oppLabel = opponent ? ` vs ${opponent}` : "";
  const notifTitle = `⚽ Score en direct — ${title}${oppLabel}`;
  const notifBody = `${score_us} - ${score_them}`;
  const now = new Date().toISOString();

  const rows = userIds.map((uid: string) => ({
    user_id: uid,
    team_id,
    type: "match_live",
    title: notifTitle,
    body: notifBody,
    reference_id: dedupRef,
    url: `/matches/${event_id}`,
    scheduled_for: now,
  }));

  const { error: insertError } = await supabase.from("notifications").insert(rows);

  if (insertError) {
    console.error("[notifications/live-score] insert error:", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  console.log(`[notifications/live-score] ${rows.length} notifs créées pour ${event_id} (${score_us}-${score_them})`);

  return NextResponse.json({ ok: true, sent: rows.length });
}
