"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlayerProfile } from "@/components/stats/PlayerProfile";

export default function PlayerStatsPage() {
  const { playerId } = useParams<{ playerId: string }>();

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center gap-3">
        <Link
          href="/roster"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Statistiques</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Fiche individuelle</p>
        </div>
      </div>
      <PlayerProfile playerId={playerId} />
    </div>
  );
}
