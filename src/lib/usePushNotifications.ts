"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { enablePushSubscription, isPushEnabledLocal } from "@/lib/push";

export function usePushNotifications() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const registered = useRef(false);

  useEffect(() => {
    const uid = user?.id;
    const tid = currentTeam?.id;
    if (!uid || !tid || registered.current) return;
    if (!isPushEnabledLocal()) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;

    async function register() {
      const res = await enablePushSubscription(uid as string, tid as string);
      if (res.ok) {
        registered.current = true;
      } else {
        console.warn("Push notification registration failed:", res.error);
      }
    }

    register();
  }, [user?.id, currentTeam?.id]);
}
