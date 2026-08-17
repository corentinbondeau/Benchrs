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
    <div className="rounded-xl border border-border bg-card">
      <div className="p-5">
        <div className={`animate-pulse rounded-lg bg-muted ${className}`} />
      </div>
    </div>
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

function TodayHeader({ name }: { name: string }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-foreground">
        Bonjour {name}
      </h1>
      <p className="text-sm text-muted-foreground mt-1 capitalize">
        {dateStr}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { userRole, clubMemberships, currentTeam } = useTeam();
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

  // Coach / Owner — "Aujourd'hui" view
  return (
    <div className="section-gap">
      <TodayHeader name={user?.profile?.first_name || ""} />

      {/* P0: Next event — most important, always visible */}
      <NextEventCard />

      {/* P0: Pending actions — convocations waiting for response */}
      <PendingConvocations />

      {/* P1: This week overview — events, availability, RPE, injuries */}
      <LazyMount fallback={<WidgetSkeleton className="h-40" />}>
        <CoachWeekOverview />
      </LazyMount>

      {/* P1: Quick stats — overview numbers */}
      <QuickStats />

      {/* P2: Recent results */}
      <RecentResults />

      {/* P3: News feed & season summary */}
      <LazyMount fallback={<WidgetSkeleton className="h-28" />}>
        <NewsFeed />
      </LazyMount>
      <LazyMount fallback={<WidgetSkeleton className="h-36" />}>
        <SeasonSummary />
      </LazyMount>
    </div>
  );
}
