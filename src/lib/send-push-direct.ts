import webpush from "@/lib/webpush";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Envoie un push directement aux user_ids spécifiés, sans passer par
 * la table notifications (qui est quand même renseignée pour l'historique).
 *
 * Retourne le nombre de push effectivement envoyés avec succès.
 */
export async function sendPushDirect(
  supabase: SupabaseClient,
  userIds: string[],
  payload: { title: string; body: string; url?: string }
): Promise<number> {
  if (userIds.length === 0) return 0;

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subscriptions || subscriptions.length === 0) return 0;

  const jsonPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
  });

  const results = await Promise.allSettled(
    (subscriptions as { endpoint: string; p256dh: string; auth: string }[]).map(
      async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            jsonPayload
          );
        } catch (err) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          }
        }
      }
    )
  );

  return results.filter((r) => r.status === "fulfilled").length;
}
