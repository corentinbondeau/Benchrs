"use client";

import { usePushNotifications } from "@/lib/usePushNotifications";

export function PushNotificationInit() {
  usePushNotifications();
  return null;
}
