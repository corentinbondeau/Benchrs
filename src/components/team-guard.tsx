"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/lib/team";

export function TeamGuard({ children }: { children: React.ReactNode }) {
  const { teams, loading } = useTeam();
  const router = useRouter();

  useEffect(() => {
    console.log("[TeamGuard] state:", { loading, teamsLength: teams.length });
    if (!loading && teams.length === 0) {
      console.log("[TeamGuard] no teams, redirecting to /create-team");
      router.replace("/create-team");
    }
  }, [loading, teams, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (teams.length === 0) {
    return null;
  }

  return <>{children}</>;
}
