"use client";

import { useAuth } from "@/lib/auth";
import { NextEventCard } from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { SeasonSummary } from "@/components/dashboard/SeasonSummary";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Bonjour, {user?.profile?.first_name} 👋
        </h2>
        <p className="text-muted-foreground mt-1">
          Voici un resume de votre equipe
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextEventCard />
        </div>
        <QuickStats />
      </div>

      <RecentResults />

      <div className="grid gap-6 md:grid-cols-2">
        <PendingConvocations />
        <NewsFeed />
      </div>

      <SeasonSummary />
    </div>
  );
}
