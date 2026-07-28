"use client";

import { useAuth } from "@/lib/auth";
import { PlayerProfile } from "@/components/stats/PlayerProfile";

export default function MyStatsPage() {
  const { user } = useAuth();

  if (!user?.id) return null;

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Mes Statistiques</h2>
        <p className="text-sm text-muted-foreground mt-1">Votre fiche individuelle</p>
      </div>
      <PlayerProfile playerId={user.id} />
    </div>
  );
}
