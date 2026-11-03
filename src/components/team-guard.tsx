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
    if (loading) return;

    // Pas d'équipe du tout → créer une équipe
    if (teams.length === 0 && clubMemberships.length === 0) {
      router.replace("/create-team");
      return;
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
