"use client";

import { createClient } from "@/lib/supabase/client";

const FALLBACK_VAPID_KEY =
  "BKp6frQFz94B7dpWC7WlId_rxF1f_7DNJUhSjX1h5wVbMLuxzSR8VHTAaalGdXHf20_CzQ91lez1CkWnFkCczoU";

const PUSH_ENABLED_KEY = "sportplus:pushEnabled";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function isValidVapidPublicKey(key: string): boolean {
  try {
    return urlBase64ToUint8Array(key).byteLength === 65;
  } catch {
    return false;
  }
}

const envKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
export const PUBLIC_VAPID_KEY =
  envKey && isValidVapidPublicKey(envKey) ? envKey : FALLBACK_VAPID_KEY;

export function isPushEnabledLocal(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(PUSH_ENABLED_KEY) !== "false";
}

export function setPushEnabledLocal(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PUSH_ENABLED_KEY, enabled ? "true" : "false");
}

export async function getPushSubscriptionCount(userId: string): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact" })
    .eq("user_id", userId);
  if (error) return 0;
  return count || 0;
}

export async function enablePushSubscription(
  userId: string,
  teamId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      return { ok: false, error: "Les notifications ne sont pas supportées par ce navigateur" };
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        ok: false,
        error:
          "Autorisation refusée. Activez les notifications dans les réglages du navigateur puis réessayez.",
      };
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY),
      });
    }
    const res = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, team_id: teamId, subscription: sub.toJSON() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, error: data?.error || "Erreur lors de la souscription" };
    }
    setPushEnabledLocal(true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function disablePushSubscription(): Promise<{ ok: boolean; error?: string }> {
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/notifications/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE" }
        );
        await sub.unsubscribe();
      }
    }
    setPushEnabledLocal(false);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
