"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTeam } from "@/lib/team";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { TeamThemeApplier } from "@/components/layout/TeamThemeApplier";

export function TeamGuard({ children }: { children: React.ReactNode }) {
  const { teams, clubMemberships, loading } = useTeam();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    // Pas d'équipe du tout → créer une équipe
    if (teams.length === 0 && clubMemberships.length === 0) {
      router.replace("/create-team");
      return;
    }

    // Plusieurs équipes ET pas déjà sur /multi ET pas en train de skip la redirect
    const skipMultiRedirect = typeof window !== "undefined" && sessionStorage.getItem("skipMultiRedirect") === "true";
    
    if (skipMultiRedirect) {
      // Nettoyer le flag immédiatement après l'avoir utilisé
      sessionStorage.removeItem("skipMultiRedirect");
      return;
    }

    if (teams.length > 1 && pathname !== "/multi") {
      router.replace("/multi");
      return;
    }
  }, [loading, teams, clubMemberships, router, pathname]);

  if (loading) {
    return <ContentSkeleton />;
  }

  if (teams.length === 0 && clubMemberships.length === 0) {
    return null;
  }

  return <TeamThemeApplier>{children}</TeamThemeApplier>;
}
