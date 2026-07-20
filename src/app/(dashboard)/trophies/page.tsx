"use client";

import { MotmVoting, TrophyCase } from "@/components/trophies/TrophyComponents";

export default function TrophiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Trophées & Vie du Club</h2>
        <p className="text-muted-foreground mt-1">
          Récompenses, votes et moments mémorables
        </p>
      </div>

      <MotmVoting />
      <TrophyCase />
    </div>
  );
}
