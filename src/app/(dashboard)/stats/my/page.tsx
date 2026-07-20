"use client";

import { useSession } from "next-auth/react";
import { PlayerProfile } from "@/components/stats/PlayerProfile";

export default function MyStatsPage() {
  const { data: session } = useSession();
  const playerId = session?.user?.id;

  if (!playerId) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Mes Statistiques</h2>
        <p className="text-muted-foreground mt-1">
          Votre fiche individuelle
        </p>
      </div>
      <PlayerProfile playerId={playerId} />
    </div>
  );
}
