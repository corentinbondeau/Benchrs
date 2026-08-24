import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureAttendanceRows } from "@/lib/convocations";
import webpush from "@/lib/webpush";

export interface DeliveryResult {
  sent: number;
  delivered: number;
  skipped: { noSubscription: number; pushDisabled: number };
}

type Notification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string | null;
  reference_id: string | null;
  team_id: string | null;
  url: string | null;
};

type PushSubscription = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NotificationPreference = {
  user_id: string;
  team_id: string;
  type: string;
  push_enabled: boolean;
};

/**
 * Lit les notifications pending (scheduled_for <= now AND delivered_at IS NULL),
 * tente l'envoi push pour chaque utilisateur, et marque `delivered_at` dans TOUS
 * les cas — même si le push ne peut pas être envoyé (pas de souscription, pref off).
 *
 * Corrige le bug du cron original où les `continue` aux lignes 191/195 empêchaient
 * le marquage `delivered_at`, bloquant la file de notifications indéfiniment.
 */
export async function deliverPendingNotifications(
  supabase: SupabaseClient
): Promise<DeliveryResult> {
  const now = new Date().toISOString();

  // 1. Lire les notifications pending (LIMIT 500)
  const { data: pending } = await supabase
    .from("notifications")
    .select("id, user_id, title, body, type, reference_id, team_id, url")
    .lte("scheduled_for", now)
    .is("delivered_at", null)
    .limit(500);

  if (!pending || pending.length === 0) {
    return {
      sent: 0,
      delivered: 0,
      skipped: { noSubscription: 0, pushDisabled: 0 },
    };
  }

  const notifications = pending as Notification[];

  // 2. Charger les préférences et souscriptions push en batch
  const userIds = [...new Set(notifications.map((n) => n.user_id))];

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("user_id, team_id, type, push_enabled")
    .in("user_id", userIds);

  const prefMap = new Map<string, boolean>();
  for (const p of (prefs || []) as NotificationPreference[]) {
    prefMap.set(`${p.user_id}|${p.team_id}|${p.type}`, p.push_enabled);
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
  for (const s of (subscriptions || []) as PushSubscription[]) {
    const arr = subsByUser.get(s.user_id) || [];
    arr.push({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth });
    subsByUser.set(s.user_id, arr);
  }

  // Résolution des URLs pour les notifications sans URL stockée
  const refIds = [
    ...new Set(
      notifications
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

  function resolveUrl(notif: Notification): string {
    if (notif.url) return notif.url;
    if (notif.reference_id) {
      const type = eventTypeMap.get(notif.reference_id);
      if (type === "match") return `/matches/${notif.reference_id}`;
      if (type === "training") return `/trainings/${notif.reference_id}`;
      if (notif.type === "convocation") return "/calendar";
    }
    return "/";
  }

  // 3. Traiter chaque notification
  let sent = 0;
  let skippedNoSubscription = 0;
  let skippedPushDisabled = 0;
  const deliveredIds: string[] = [];
  const convokedEvents = new Map<
    string,
    { eventId: string; teamId: string | null; userIds: Set<string> }
  >();

  for (const notif of notifications) {
    // Vérifier les préférences push — skip push mais MARQUER delivered_at
    if (prefMap.get(`${notif.user_id}|${notif.team_id}|${notif.type}`) === false) {
      console.log(
        `[deliver-notifications] skipped:push_disabled notif=${notif.id} user=${notif.user_id}`
      );
      skippedPushDisabled++;
      // ✅ FIX : on ajoute quand même à deliveredIds (bug corrigé)
      deliveredIds.push(notif.id);
      continue;
    }

    // Vérifier les souscriptions push — skip push mais MARQUER delivered_at
    const subs = subsByUser.get(notif.user_id) || [];
    if (subs.length === 0) {
      console.log(
        `[deliver-notifications] skipped:no_subscription notif=${notif.id} user=${notif.user_id}`
      );
      skippedNoSubscription++;
      // ✅ FIX : on ajoute quand même à deliveredIds (bug corrigé)
      deliveredIds.push(notif.id);
      continue;
    }

    // Tenter l'envoi push pour chaque souscription
    const url = resolveUrl(notif);
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: notif.title, body: notif.body, url })
        );
        console.log(
          `[deliver-notifications] sent:ok notif=${notif.id} user=${notif.user_id} endpoint=${sub.endpoint}`
        );
        sent++;
      } catch (err) {
        console.error(
          `[deliver-notifications] sent:failed notif=${notif.id} user=${notif.user_id} endpoint=${sub.endpoint}`,
          err
        );
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
        }
      }
    }

    // Marquer delivered dans tous les cas (push envoyé ou non)
    deliveredIds.push(notif.id);

    // Traitement spécial convocations
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

  // 4. Marquer delivered_at en batch
  if (deliveredIds.length > 0) {
    await supabase
      .from("notifications")
      .update({ delivered_at: now })
      .in("id", deliveredIds);
  }

  // 5. Traiter les convocations livrées (ensureAttendanceRows + convocations_sent_at)
  for (const entry of convokedEvents.values()) {
    if (entry.teamId) {
      await ensureAttendanceRows(entry.eventId, entry.teamId, [...entry.userIds]);
    }
    await supabase
      .from("events")
      .update({ convocations_sent_at: now })
      .eq("id", entry.eventId);
  }

  return {
    sent,
    delivered: deliveredIds.length,
    skipped: {
      noSubscription: skippedNoSubscription,
      pushDisabled: skippedPushDisabled,
    },
  };
}
