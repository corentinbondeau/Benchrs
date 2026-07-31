"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";

const PUBLIC_VAPID_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BKp6frQFz94B7dpWC7WlId_rxF1f_7DNJUhSjX1h5wVbMLuxzSR8VHTAaalGdXHf20_CzQ91lez1CkWnFkCczoU";

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
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: PUBLIC_VAPID_KEY,
        });

        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: uid,
            team_id: tid,
            subscription: sub.toJSON(),
          }),
        });

        registered.current = true;
      } catch {
        console.warn("Push notification registration failed");
      }
    }

    register();
  }, [user?.id, currentTeam?.id]);
}
