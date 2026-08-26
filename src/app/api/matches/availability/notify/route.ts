import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import webpush from "@/lib/webpush";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
  isTeamCoach,
} from "@/lib/api-auth";
import { isEventLocked, CONVOCATION_LOCKED_MESSAGE } from "@/lib/event-lock";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const body = await req.json();
    const { eventId, teamId } = body;
    if (!eventId || typeof eventId !== "string" || !teamId || typeof teamId !== "string") {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!(await isTeamCoach(user.id, teamId))) {
      return forbidden();
    }

    const supabase = createAdminClient();

    const { data: event } = await supabase
      .from("events")
      .select("title, opponent, event_date, type")
      .eq("id", eventId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (!event) {
      return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
    }
    if (isEventLocked((event as { event_date: string }).event_date)) {
      return NextResponse.json({ error: CONVOCATION_LOCKED_MESSAGE }, { status: 409 });
    }

    // Destinataires : joueurs actifs + parents liés (infra convocations)
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["player"]);
    const playerIds = (members || []).map((m) => m.user_id);
    if (playerIds.length === 0) {
      return NextResponse.json({ error: "Aucun joueur dans l'équipe" }, { status: 400 });
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .in("id", playerIds)
      .eq("is_active", true);
    const activeIds = (profiles || []).map((p) => p.id);
    if (activeIds.length === 0) {
      return NextResponse.json({ error: "Aucun joueur actif" }, { status: 400 });
    }
    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .in("student_id", activeIds);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const userIds = [...new Set([...activeIds, ...parentIds])];

    const dateLabel = new Date(event.event_date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const title = event.opponent
      ? `Dispo pour le match contre ${event.opponent} ?`
      : "Dispo pour le match ?";
    const notifBody = `Match ${dateLabel}${event.opponent ? ` contre ${event.opponent}` : ""}. Réponds dispo, pas dispo ou incertain.`;

    const now = new Date().toISOString();
    const rows = userIds.map((uid: string) => ({
      user_id: uid,
      team_id: teamId,
      type: "dispo",
      title,
      body: notifBody,
      reference_id: eventId,
      url: `/matches/${eventId}`,
      delivered_at: now,
    }));
    const { error: insertError } = await supabase.from("notifications").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Push
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, push_enabled")
      .eq("type", "dispo")
      .eq("team_id", teamId)
      .in("user_id", userIds);
    const pushDisabled = new Set(
      ((prefs || []) as { user_id: string; push_enabled: boolean }[])
        .filter((p) => !p.push_enabled)
        .map((p) => p.user_id)
    );
    const pushUserIds = userIds.filter((uid: string) => !pushDisabled.has(uid));

    let sent = 0;
    if (pushUserIds.length > 0) {
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .in("user_id", pushUserIds);
    for (const sub of (subscriptions || []) as { endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body: notifBody, url: `/matches/${eventId}` })
        );
        sent++;
      } catch (err) {
          console.error("[availability/notify] push failed", err);
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
    }

    return NextResponse.json({ ok: true, recipients: userIds.length, sent });
  } catch (err) {
    console.error("[availability/notify] unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
