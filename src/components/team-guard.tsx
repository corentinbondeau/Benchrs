"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/lib/team";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { TeamThemeApplier } from "@/components/layout/TeamThemeApplier";

export function TeamGuard({ children }: { children: React.ReactNode }) {
  const { teams, clubMemberships, loading } = useTeam();
  const router = useRouter();

  useEffect(() => {
    if (!loading && teams.length === 0 && clubMemberships.length === 0) {
      router.replace("/create-team");
    }
  }, [loading, teams, clubMemberships, router]);

  if (loading) {
    return <ContentSkeleton />;
  }

  if (teams.length === 0 && clubMemberships.length === 0) {
    return null;
  }

  return <TeamThemeApplier>{children}</TeamThemeApplier>;
}
