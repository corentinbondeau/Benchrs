"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Profile } from "@/types";

interface PlayerCardProps {
  player: Profile;
  stats?: {
    goals: number;
    matches: number;
    attendanceRate: number;
  };
}

const positionColors: Record<string, string> = {
  Gardien: "bg-amber-500/10 text-amber-600 dark:bg-amber-500/20",
  Défenseur: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20",
  Milieu: "bg-green-500/10 text-green-600 dark:bg-green-500/20",
  Attaquant: "bg-red-500/10 text-red-600 dark:bg-red-500/20",
};

export function PlayerCard({ player, stats }: PlayerCardProps) {
  const initials = `${player.first_name[0]}${player.last_name[0]}`;

  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 shrink-0">
            <AvatarImage src={player.avatar_url || undefined} />
            <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-sm font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">
                {player.first_name} {player.last_name}
              </h3>
              {player.shirt_number != null && (
                <Badge variant="secondary" className="shrink-0 text-xs">
                  #{player.shirt_number}
                </Badge>
              )}
            </div>

            {player.position && (
              <Badge
                variant="secondary"
                className={`mt-1 text-xs ${positionColors[player.position] || ""}`}
              >
                {player.position}
              </Badge>
            )}
          </div>
        </div>

        {stats && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-center">
            <div>
              <p className="text-lg font-bold text-[var(--gold)]">{stats.goals}</p>
              <p className="text-xs text-muted-foreground">Buts</p>
            </div>
            <div>
              <p className="text-lg font-bold">{stats.matches}</p>
              <p className="text-xs text-muted-foreground">Matchs</p>
            </div>
            <div>
              <p className="text-lg font-bold">
                {stats.attendanceRate}%
              </p>
              <p className="text-xs text-muted-foreground">Présence</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
