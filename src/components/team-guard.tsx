"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/lib/team";

export function TeamGuard({ children }: { children: React.ReactNode }) {
  const { teams, clubMemberships, loading } = useTeam();
  const router = useRouter();

  useEffect(() => {
    if (!loading && teams.length === 0 && clubMemberships.length === 0) {
      router.replace("/create-team");
    }
  }, [loading, teams, clubMemberships, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (teams.length === 0 && clubMemberships.length === 0) {
    return null;
  }

  return <>{children}</>;
}
