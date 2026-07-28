"use client";

import { useAuth } from "@/lib/auth";
import { NextEventCard } from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { SeasonSummary } from "@/components/dashboard/SeasonSummary";
import { PlayerDashboard } from "@/components/dashboard/PlayerDashboard";
import { ParentDashboard } from "@/components/dashboard/ParentDashboard";

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.profile?.role;

  if (role === "player") {
    return <PlayerDashboard />;
  }

  if (role === "parent") {
    return <ParentDashboard />;
  }

  // Coach / default
  return (
    <div className="pb-24">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xl font-bold">
          Bonjour, {user?.profile?.first_name} 👋
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Voici un résumé de votre équipe
        </p>
      </div>

      <div className="px-4 space-y-4">
        <NextEventCard />
        <QuickStats />
        <RecentResults />
        <PendingConvocations />
        <NewsFeed />
        <SeasonSummary />
      </div>
    </div>
  );
}
