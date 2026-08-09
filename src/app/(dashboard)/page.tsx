"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { LazyMount } from "@/components/LazyMount";
import { NextEventCard } from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { CoachWeekOverview } from "@/components/dashboard/CoachWeekOverview";
import { PlayerDashboard } from "@/components/dashboard/PlayerDashboard";
import { ParentDashboard } from "@/components/dashboard/ParentDashboard";
import { Card, CardContent } from "@/components/ui/card";

function WidgetSkeleton({ className = "" }: { className?: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className={`animate-pulse rounded-lg bg-muted ${className}`} />
      </CardContent>
    </Card>
  );
}

const NewsFeed = dynamic(
  () => import("@/components/dashboard/NewsFeed").then((m) => m.NewsFeed),
  {
    loading: () => <WidgetSkeleton className="h-28" />,
  }
);

const SeasonSummary = dynamic(
  () => import("@/components/dashboard/SeasonSummary").then((m) => m.SeasonSummary),
  {
    loading: () => <WidgetSkeleton className="h-36" />,
  }
);

export default function DashboardPage() {
  const { user } = useAuth();
  const { userRole, clubMemberships } = useTeam();
  const router = useRouter();
  const isComiteOnly = clubMemberships.length > 0 && userRole === null;

  useEffect(() => {
    if (isComiteOnly) {
      router.replace("/club");
    }
  }, [isComiteOnly, router]);

  if (isComiteOnly) {
    return null;
  }

  if (userRole === "player") {
    return <PlayerDashboard />;
  }

  if (userRole === "parent") {
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
        <LazyMount fallback={<WidgetSkeleton className="h-40" />}>
          <CoachWeekOverview />
        </LazyMount>
        <QuickStats />
        <RecentResults />
        <PendingConvocations />
        <LazyMount fallback={<WidgetSkeleton className="h-28" />}>
          <NewsFeed />
        </LazyMount>
        <LazyMount fallback={<WidgetSkeleton className="h-36" />}>
          <SeasonSummary />
        </LazyMount>
      </div>
    </div>
  );
}
