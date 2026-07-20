"use client";

import { useSession } from "next-auth/react";
import { NextEventCard } from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { QuickStats } from "@/components/dashboard/QuickStats";

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Bonjour, {user?.firstName} 👋
        </h2>
        <p className="text-muted-foreground mt-1">
          Voici un résumé de votre équipe
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextEventCard />
        </div>
        <QuickStats />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <PendingConvocations />
        <NewsFeed />
      </div>
    </div>
  );
}
