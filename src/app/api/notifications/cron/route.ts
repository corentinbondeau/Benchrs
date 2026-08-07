import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAttendanceRows } from "@/lib/convocations";
import webpush from "@/lib/webpush";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // --- Rappels la veille : planifie une notif « demain » pour chaque événement du lendemain ---
  const startTomorrow = new Date();
  startTomorrow.setHours(0, 0, 0, 0);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const endTomorrow = new Date(startTomorrow);
  endTomorrow.setDate(endTomorrow.getDate() + 1);

  const { data: tomorrowEvents } = await supabase
    .from("events")
    .select("id, team_id, type, title, opponent, event_date")
    .eq("status", "upcoming")
    .gte("event_date", startTomorrow.toISOString())
    .lt("event_date", endTomorrow.toISOString());

  for (const ev of (tomorrowEvents || []) as { id: string; team_id: string | null; type: string; title: string; opponent: string | null; event_date: string }[]) {
    if (!ev.team_id) continue;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "rappel")
      .eq("reference_id", ev.id)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", ev.team_id)
      .in("role", ["player"]);
    const playerIds = (members || []).map((m) => m.user_id);
    if (playerIds.length === 0) continue;

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id")
      .in("id", playerIds)
      .eq("is_active", true);
    const activeIds = (profiles || []).map((p) => p.id);
    if (activeIds.length === 0) continue;

    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", ev.team_id)
      .in("student_id", activeIds);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const userIds = [...new Set([...activeIds, ...parentIds])];

    const dateLabel = new Date(ev.event_date).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const hour = new Date(ev.event_date).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const isMatch = ev.type === "match";

    const rows = userIds.map((uid: string) => ({
      user_id: uid,
      team_id: ev.team_id,
      type: "rappel",
      title: isMatch ? "Match demain !" : "Entraînement demain",
      body: `Demain ${dateLabel} à ${hour}${isMatch && ev.opponent ? ` contre ${ev.opponent}` : ""}`,
      reference_id: ev.id,
      url: isMatch ? `/matches/${ev.id}` : `/trainings/${ev.id}`,
      scheduled_for: now,
    }));
    const { error: insertErr } = await supabase.from("notifications").insert(rows);
    if (insertErr) {
      console.error("[notifications/cron] rappel insert error:", insertErr);
    }
  }

  const { data: pending } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, type, reference_id, team_id, url")
    .lte("scheduled_for", now)
    .is("delivered_at", null)
    .limit(500);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, processed: 0 });
  }

  const userIds = [...new Set(pending.map((n) => n.user_id))];

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, team_id, type, push_enabled")
    .in("user_id", userIds);

  const prefMap = new Map<string, boolean>();
  for (const p of (prefs || []) as { user_id: string; team_id: string; type: string; push_enabled: boolean }[]) {
    prefMap.set(`${p.user_id}|${p.team_id}|${p.type}`, p.push_enabled);
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of (subscriptions || []) as { user_id: string; endpoint: string; p256dh: string; auth: string }[]) {
    const arr = subsByUser.get(s.user_id) || [];
    arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByUser.set(s.user_id, arr);
  }

  // Resolve target URL for notifications without a stored one (older rows):
  // fetch the event type so the click opens the séance/match page.
  const refIds = [
    ...new Set(
      pending
        .filter((n) => !n.url && n.reference_id)
        .map((n) => n.reference_id as string)
    ),
  ];
  const eventTypeMap = new Map<string, string>();
  if (refIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id, type")
      .in("id", refIds);
    for (const evt of (events || []) as { id: string; type: string }[]) {
      eventTypeMap.set(evt.id, evt.type);
    }
  }

  function resolveUrl(notif: { url?: string | null; type?: string | null; reference_id?: string | null }): string {
    if (notif.url) return notif.url;
    if (notif.reference_id) {
      const type = eventTypeMap.get(notif.reference_id);
      if (type === "match") return `/matches/${notif.reference_id}`;
      if (type === "training") return `/trainings/${notif.reference_id}`;
      if (notif.type === "convocation") return "/calendar";
    }
    return "/";
  }

  let sent = 0;
  const deliveredIds: string[] = [];
  const convokedEvents = new Map<
    string,
    { eventId: string; teamId: string | null; userIds: Set<string> }
  >();
  for (const notif of pending) {
    if (prefMap.get(`${notif.user_id}|${notif.team_id}|${notif.type}`) === false) {
      continue;
    }
    const subs = subsByUser.get(notif.user_id) || [];
    if (subs.length === 0) {
      continue;
    }
    const url = resolveUrl(notif);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: notif.title, body: notif.body, url })
        );
        sent++;
      } catch (err) {
        console.error("[notifications/cron] push failed for", sub.endpoint, err);
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
      }
    }
    deliveredIds.push(notif.id);
    if (notif.type === "convocation" && notif.reference_id) {
      const key = `${notif.reference_id}|${notif.team_id}`;
      const entry = convokedEvents.get(key) || {
        eventId: notif.reference_id,
        teamId: notif.team_id || null,
        userIds: new Set<string>(),
      };
      entry.userIds.add(notif.user_id);
      convokedEvents.set(key, entry);
    }
  }

  if (deliveredIds.length > 0) {
    await supabase
      .from("notifications")
      .update({ delivered_at: now })
      .in("id", deliveredIds);
  }

  for (const entry of convokedEvents.values()) {
    if (entry.teamId) {
      await ensureAttendanceRows(entry.eventId, entry.teamId, [...entry.userIds]);
    }
    await supabase
      .from("events")
      .update({ convocations_sent_at: now })
      .eq("id", entry.eventId);
  }

  return NextResponse.json({ ok: true, sent, processed: deliveredIds.length });
}
