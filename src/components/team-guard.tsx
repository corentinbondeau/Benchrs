"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTeam } from "@/lib/team";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { TeamThemeApplier } from "@/components/layout/TeamThemeApplier";

export function TeamGuard({ children }: { children: React.ReactNode }) {
  const { teams, clubMemberships, loading } = useTeam();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (loading) return;

    // Pas d'équipe du tout → créer une équipe
    if (teams.length === 0 && clubMemberships.length === 0) {
      router.replace("/create-team");
      return;
    }

    // Si on vient de /multi (query param from=multi), ne pas rediriger
    const fromMulti = searchParams.get("from") === "multi";
    
    if (fromMulti) {
      return;
    }

    // Plusieurs équipes ET pas déjà sur /multi → rediriger vers /multi
    if (teams.length > 1 && pathname !== "/multi") {
      router.replace("/multi");
      return;
    }
  }, [loading, teams, clubMemberships, router, pathname, searchParams]);

  if (loading) {
    return <ContentSkeleton />;
  }

  if (teams.length === 0 && clubMemberships.length === 0) {
    return null;
  }

  return <TeamThemeApplier>{children}</TeamThemeApplier>;
}
