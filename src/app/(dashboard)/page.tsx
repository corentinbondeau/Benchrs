"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { LazyMount } from "@/components/LazyMount";
import NextEventCard from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import QuickStats from "@/components/dashboard/QuickStats";
import RecentResults from "@/components/dashboard/RecentResults";
import { CoachWeekOverview } from "@/components/dashboard/CoachWeekOverview";
import { PlayerDashboard } from "@/components/dashboard/PlayerDashboard";
import { ParentDashboard } from "@/components/dashboard/ParentDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { OnboardingTip } from "@/components/OnboardingTips";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Event } from "@/types";

function WidgetSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-5">
        <div className={`animate-pulse rounded-lg bg-muted ${className}`} />
      </div>
    </div>
  );
}


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

/** Encart "Jour de match" — affiché si un match est prévu aujourd'hui */
function MatchDayBanner() {
  const router = useRouter();
  const { currentTeam } = useTeam();

  const { data: matchToday } = useQueryCache<Event | null>(
    currentTeam ? `events:match-today:${currentTeam.id}` : null,
    async () => {
      const supabase = createClient();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("events")
        .select("id, title, event_date, opponent, type")
        .eq("team_id", currentTeam!.id)
        .eq("type", "match")
        .in("status", ["upcoming", "ongoing"])
        .gte("event_date", todayStart.toISOString())
        .lte("event_date", todayEnd.toISOString())
        .order("event_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return (data as Event | null) || null;
    },
    { ttl: 300_000 }
  );

  if (!matchToday) return null;

  return (
    <Card className="border-[var(--color-gold)] bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950/20 dark:to-amber-950/10">
      <CardContent className="p-4 flex items-center gap-3">
        <Trophy className="h-6 w-6 text-[var(--color-gold)] shrink-0" />
        <div className="min-w-0">
          <p className="font-bold text-sm">Jour de match !</p>
          <p className="text-xs text-muted-foreground truncate">
            {matchToday.title || matchToday.opponent} —{" "}
            {new Date(matchToday.event_date).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto shrink-0"
          onClick={() => router.push(`/matches/${matchToday.id}`)}
        >
          Voir le match
        </Button>
      </CardContent>
    </Card>
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

      <MatchDayBanner />

      <OnboardingTip
        tipKey="dashboard-welcome"
        title="Bienvenue sur Benchrs !"
        description="Depuis ce tableau de bord, vous pouvez voir votre semaine, gérer les convocations et suivre les résultats. Explorez le menu pour découvrir toutes les fonctionnalités."
      />

      {/* P0: Next event — most important, always visible */}
      <ErrorBoundary>
        <Suspense fallback={<ContentSkeleton />}>
          <NextEventCard />
        </Suspense>
      </ErrorBoundary>

      {/* P0: Pending actions — convocations waiting for response */}
      <ErrorBoundary>
        <Suspense fallback={<ContentSkeleton />}>
          <PendingConvocations />
        </Suspense>
      </ErrorBoundary>

      {/* P1: This week overview — events, availability, RPE, injuries */}
      <ErrorBoundary>
        <LazyMount fallback={<WidgetSkeleton className="h-40" />}>
          <CoachWeekOverview />
        </LazyMount>
      </ErrorBoundary>

      {/* P1: Quick stats — overview numbers */}
      <ErrorBoundary>
        <QuickStats />
      </ErrorBoundary>

      {/* P2: Recent results */}
      <ErrorBoundary>
        <RecentResults />
      </ErrorBoundary>

      {/* P3: Season summary */}
      <ErrorBoundary>
        <LazyMount fallback={<WidgetSkeleton className="h-36" />}>
          <SeasonSummary />
        </LazyMount>
      </ErrorBoundary>
    </div>
  );
}
