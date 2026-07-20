"use client";

import { RosterGrid } from "@/components/roster/RosterGrid";

export default function RosterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Effectif</h2>
        <p className="text-muted-foreground mt-1">
          Liste des joueurs de l&apos;équipe
        </p>
      </div>
      <RosterGrid />
    </div>
  );
}
