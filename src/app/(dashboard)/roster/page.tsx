"use client";

import { useCallback, useState } from "react";
import { RosterGrid } from "@/components/roster/RosterGrid";
import { AddPlayerDialog } from "@/components/roster/AddPlayerDialog";

export default function RosterPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Effectif</h2>
          <p className="text-muted-foreground mt-1">
            Liste des joueurs de l&apos;équipe
          </p>
        </div>
        <AddPlayerDialog onAdded={() => setRefreshKey((k) => k + 1)} />
      </div>
      <RosterGrid key={refreshKey} />
    </div>
  );
}
