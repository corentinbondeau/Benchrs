"use client";

import { useSession } from "next-auth/react";
import { NextEventCard } from "@/components/dashboard/NextEventCard";
import { PendingConvocations } from "@/components/dashboard/PendingConvocations";
import { NewsFeed } from "@/components/dashboard/NewsFeed";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { PlayerStats } from "@/components/dashboard/PlayerStats";

export default function DashboardPage() {
  const { data: session } = useSession();
  const user = session?.user;
  const role = user?.role;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Bonjour, {user?.firstName} 👋
        </h2>
        <p className="text-muted-foreground mt-1">
          {role === "coach"
            ? "Vue d'ensemble de votre équipe"
            : role === "player"
              ? "Suivez vos entraînements et matchs"
              : "Suivez l'actualité de votre enfant"}
        </p>
      </div>

      {role === "coach" && (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <NextEventCard />
            </div>
            <QuickStats />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <PendingConvocations />
            <NewsFeed />
          </div>
        </>
      )}

      {role === "player" && (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <NextEventCard />
            </div>
            <PlayerStats />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <PendingConvocations />
            <NewsFeed />
          </div>
        </>
      )}

      {role === "parent" && (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <NextEventCard />
            </div>
            <PlayerStats showChild />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <PendingConvocations showChild />
            <NewsFeed />
          </div>
        </>
      )}
    </div>
  );
}
