"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlayerProfile } from "@/components/stats/PlayerProfile";

export default function PlayerStatsPage() {
  const { playerId } = useParams<{ playerId: string }>();

  return (
    <div className="section-gap">
      <div className="flex items-center gap-3">
        <Link
          href="/roster"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors -ml-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Fiche joueur</h1>
          <p className="text-sm text-muted-foreground mt-1">Statistiques et performance</p>
        </div>
      </div>
      <PlayerProfile playerId={playerId} />
    </div>
  );
}
