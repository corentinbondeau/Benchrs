"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";

const FALLBACK_VAPID_KEY =
  "BKp6frQFz94B7dpWC7WlId_rxF1f_7DNJUhSjX1h5wVbMLuxzSR8VHTAaalGdXHf20_CzQ91lez1CkWnFkCczoU";

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
const PUBLIC_VAPID_KEY =
  envKey && isValidVapidPublicKey(envKey) ? envKey : FALLBACK_VAPID_KEY;

export function usePushNotifications() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const registered = useRef(false);

  useEffect(() => {
    const uid = user?.id;
    const tid = currentTeam?.id;
    if (!uid || !tid || registered.current) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    async function register() {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

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
          body: JSON.stringify({
            user_id: uid,
            team_id: tid,
            subscription: sub.toJSON(),
          }),
        });

        if (!res.ok) {
          console.warn("Push subscription sync failed", await res.text().catch(() => ""));
          return;
        }

        registered.current = true;
      } catch (err) {
        console.warn("Push notification registration failed", err);
      }
    }

    register();
  }, [user?.id, currentTeam?.id]);
}
