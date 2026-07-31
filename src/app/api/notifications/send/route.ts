import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import webpush from "@/lib/webpush";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user_ids, title, body: notifBody, type, reference_id, team_id, scheduled_for, url } = body;

    if (!Array.isArray(user_ids) || user_ids.length === 0 || !title || !notifBody) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const isScheduled =
      !!scheduled_for && new Date(scheduled_for).getTime() > Date.now();

    const rows = user_ids.map((uid: string) => ({
      user_id: uid,
      title,
      body: notifBody,
      type: type || "convocation",
      reference_id: reference_id || null,
      team_id: team_id || null,
      scheduled_for: isScheduled ? scheduled_for : null,
      delivered_at: isScheduled ? null : now,
    }));

    const { error: insertError } = await supabase.from("notifications").insert(rows);
    if (insertError) {
      console.error("[notifications/send] insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (isScheduled) {
      return NextResponse.json({ ok: true, scheduled: rows.length });
    }

    const prefType = type || "convocation";
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, push_enabled")
      .eq("type", prefType)
      .eq("team_id", team_id || null)
      .in("user_id", user_ids);

    const pushDisabled = new Set(
      ((prefs || []) as { user_id: string; push_enabled: boolean }[])
        .filter((p) => !p.push_enabled)
        .map((p) => p.user_id)
    );
    const pushUserIds = user_ids.filter((uid: string) => !pushDisabled.has(uid));

    if (pushUserIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped: user_ids.length });
    }

    const { data: subscriptions } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .in("user_id", pushUserIds);

    let sent = 0;
    for (const sub of (subscriptions || []) as { endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body: notifBody, url: url || "/" })
        );
        sent++;
      } catch (err) {
        console.error("[notifications/send] push failed for", sub.endpoint, err);
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[notifications/send] unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
