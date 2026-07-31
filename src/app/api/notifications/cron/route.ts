import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let sent = 0;
  const deliveredIds: string[] = [];
  for (const notif of pending) {
    if (prefMap.get(`${notif.user_id}|${notif.team_id}|${notif.type}`) === false) {
      continue;
    }
    const subs = subsByUser.get(notif.user_id) || [];
    if (subs.length === 0) {
      continue;
    }
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: notif.title,
            body: notif.body,
            url: notif.url || (notif.type === "convocation" && notif.reference_id
              ? "/calendar"
              : "/"),
          })
        );
        sent++;
      } catch (err) {
        console.error("[notifications/cron] push failed for", sub.endpoint, err);
      }
    }
    deliveredIds.push(notif.id);
  }

  if (deliveredIds.length > 0) {
    await supabase
      .from("notifications")
      .update({ delivered_at: now })
      .in("id", deliveredIds);
  }

  return NextResponse.json({ ok: true, sent, processed: deliveredIds.length });
}
