"use client";

import { NotificationList } from "@/components/notifications/NotificationList";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Notifications</h2>
        <p className="text-muted-foreground mt-1">
          Alertes et messages de l&apos;équipe
        </p>
      </div>

      <NotificationList />
    </div>
  );
}
