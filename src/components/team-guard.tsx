"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTeam } from "@/lib/team";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { TeamThemeApplier } from "@/components/layout/TeamThemeApplier";

export function TeamGuard({ children }: { children: React.ReactNode }) {
  const { teams, clubMemberships, loading } = useTeam();
  const router = useRouter();
  const pathname = usePathname();
  const [isMounted, setIsMounted] = useState(false);
  const [fromMulti, setFromMulti] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Lire le param from=multi une seule fois au mount
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const hasFromMulti = searchParams.get("from") === "multi";
      setFromMulti(hasFromMulti);
      
      // Si from=multi, sauvegarder dans sessionStorage pour persister à travers les reloads
      if (hasFromMulti) {
        sessionStorage.setItem("fromMulti", "true");
        console.log("[TeamGuard] Set fromMulti flag in sessionStorage");
      }
    }
  }, []);

  useEffect(() => {
    if (!isMounted || loading) return;

    // Pas d'équipe du tout → créer une équipe
    if (teams.length === 0 && clubMemberships.length === 0) {
      router.replace("/create-team");
      return;
    }

    // Vérifier si fromMulti est true (soit du state, soit du sessionStorage)
    const shouldSkipMultiRedirect = fromMulti || 
      (typeof window !== "undefined" && sessionStorage.getItem("fromMulti") === "true");
    
    if (shouldSkipMultiRedirect) {
      console.log("[TeamGuard] Skipping multi-redirect");
      // Nettoyer le flag après l'avoir utilisé
      sessionStorage.removeItem("fromMulti");
      return;
    }

    // Plusieurs équipes ET pas déjà sur /multi → rediriger vers /multi
    if (teams.length > 1 && pathname !== "/multi") {
      console.log("[TeamGuard] Redirecting to /multi");
      router.replace("/multi");
      return;
    }
  }, [isMounted, loading, teams, clubMemberships, router, pathname, fromMulti]);

  if (loading) {
    return <ContentSkeleton />;
  }

  if (teams.length === 0 && clubMemberships.length === 0) {
    return null;
  }

  return <TeamThemeApplier>{children}</TeamThemeApplier>;
}
