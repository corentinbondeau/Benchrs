import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAttendanceRows } from "@/lib/convocations";
import webpush from "@/lib/webpush";
import { rateLimit, NOTIFY_LIMIT, clientKey } from "@/lib/rateLimit";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
  isTeamMember,
  getTeamRole,
} from "@/lib/api-auth";
import { isEventLocked, CONVOCATION_LOCKED_MESSAGE } from "@/lib/event-lock";

export const dynamic = "force-dynamic";

const SEND_TYPES = new Set([
  "convocation",
  "message",
  "rappel",
  "physical",
  "match_retour",
  "match_report",
  "terrain_impraticable",
  "reunion",
  "cagnotte",
  "recuperation",
  "newsletter",
  "suspension",
  "match_checklist",
  "tournament",
  "on_est_parti",
  "match_live",
  "voeux",
  "relance_seance",
]);

function isInternalUrl(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.includes("://") && !url.includes(":\\\\");
}

export async function POST(req: Request) {
  try {
    if (!rateLimit(`notify:${clientKey(req)}`, NOTIFY_LIMIT)) {
      return NextResponse.json(
        { error: "Trop de notifications, réessayez dans une minute" },
        { status: 429 }
      );
    }
    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const body = await req.json();
    const { user_ids, title, body: notifBody, type, reference_id, team_id, scheduled_for, url } = body;

    if (!Array.isArray(user_ids) || user_ids.length === 0 || !title || !notifBody) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (user_ids.length > 500) {
      return NextResponse.json({ error: "Trop de destinataires" }, { status: 400 });
    }

    if (typeof title !== "string" || title.length > 200) {
      return NextResponse.json({ error: "Titre trop long" }, { status: 400 });
    }
    if (typeof notifBody !== "string" || notifBody.length > 2000) {
      return NextResponse.json({ error: "Contenu trop long" }, { status: 400 });
    }

    if (typeof team_id !== "string" || !(await isTeamMember(user.id, team_id))) {
      return NextResponse.json({ error: "Accès refusé à cette équipe" }, { status: 403 });
    }

    const notifType = typeof type === "string" ? type : "convocation";
    if (!SEND_TYPES.has(notifType)) {
      return NextResponse.json({ error: "Type de notification invalide" }, { status: 400 });
    }

    if (url != null) {
      if (typeof url !== "string" || !isInternalUrl(url)) {
        return NextResponse.json({ error: "URL invalide" }, { status: 400 });
      }
    }

    if (scheduled_for != null && Number.isNaN(new Date(scheduled_for).getTime())) {
      return NextResponse.json({ error: "Date de planification invalide" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const role = await getTeamRole(user.id, team_id);
    const isCoach = role === "owner" || role === "coach";

    // Les non-coachs ne peuvent notifier que via la messagerie (type "message")
    // et uniquement sur un canal dont ils sont membres.
    if (!isCoach) {
      if (notifType !== "message") {
        return forbidden();
      }
      if (typeof reference_id !== "string") {
        return forbidden();
      }
      const { data: channel } = await supabase
        .from("chat_channels")
        .select("id")
        .eq("id", reference_id)
        .eq("team_id", team_id)
        .maybeSingle();
      if (!channel) return forbidden();
      const { data: member } = await supabase
        .from("chat_members")
        .select("id")
        .eq("channel_id", reference_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!member) return forbidden();
    }

    // Les convocations doivent référencer un événement de l'équipe appelante
    // (un coach ne peut pas marquer les convocations d'une autre équipe).
    if (notifType === "convocation" && reference_id != null) {
      if (typeof reference_id !== "string") {
        return NextResponse.json({ error: "Référence invalide" }, { status: 400 });
      }
      const { data: ev } = await supabase
        .from("events")
        .select("id, event_date, end_date")
        .eq("id", reference_id)
        .eq("team_id", team_id)
        .maybeSingle();
      if (!ev) {
        return NextResponse.json({ error: "Événement invalide" }, { status: 400 });
      }
      if (
        isEventLocked(
          (ev as { event_date: string; end_date: string | null }).event_date,
          (ev as { event_date: string; end_date: string | null }).end_date
        )
      ) {
        return NextResponse.json({ error: CONVOCATION_LOCKED_MESSAGE }, { status: 409 });
      }
    }

    // Les destinataires doivent être membres de l'équipe ou parents liés dans l'équipe.
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", team_id);
    const { data: parentLinks } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", team_id);
    const allowedIds = new Set<string>([
      ...((members || []) as { user_id: string }[]).map((m) => m.user_id),
      ...((parentLinks || []) as { parent_id: string }[]).map((p) => p.parent_id),
    ]);
    const invalid = (user_ids as string[]).filter((uid) => !allowedIds.has(uid));
    if (invalid.length > 0) {
      return NextResponse.json({ error: "Destinataires hors équipe" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const isScheduled =
      !!scheduled_for && new Date(scheduled_for).getTime() > Date.now();

    const rows = user_ids.map((uid: string) => ({
      user_id: uid,
      title,
      body: notifBody,
      type: notifType,
      reference_id: reference_id || null,
      team_id,
      url: url || null,
      scheduled_for: isScheduled ? scheduled_for : null,
      delivered_at: isScheduled ? null : now,
    }));

    const { error: insertError } = await supabase.from("notifications").insert(rows);
    if (insertError) {
      console.error("[notifications/send] insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (!isScheduled && notifType === "convocation" && reference_id) {
      await supabase
        .from("events")
        .update({ convocations_sent_at: now })
        .eq("id", reference_id)
        .eq("team_id", team_id);
      await ensureAttendanceRows(reference_id, team_id, user_ids);
    }

    if (isScheduled) {
      return NextResponse.json({ ok: true, scheduled: rows.length });
    }

    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, push_enabled")
      .eq("type", notifType)
      .eq("team_id", team_id)
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
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[notifications/send] unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
