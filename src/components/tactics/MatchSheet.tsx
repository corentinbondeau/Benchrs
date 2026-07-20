"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Play, Pause, RotateCcw } from "lucide-react";
import { RoleGuard } from "@/components/layout/RoleGuard";
import type { Profile } from "@/types";

export function MatchSheet() {
  const { data: session } = useSession();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [matchTime, setMatchTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [substitutions, setSubstitutions] = useState<
    { playerIn: string; playerOut: string; minute: number }[]
  >([]);
  const [scoreUs, setScoreUs] = useState(0);
  const [scoreThem, setScoreThem] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    async function fetchPlayers() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .eq("is_active", true)
        .order("shirt_number");
      setPlayers((data as Profile[]) || []);
    }
    fetchPlayers();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isRunning) {
      interval = setInterval(() => {
        setMatchTime((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, []);

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feuillet de match</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Score */}
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <Label className="text-xs text-muted-foreground">NOUS</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setScoreUs(Math.max(0, scoreUs - 1))}
                >
                  -
                </Button>
                <span className="text-4xl font-bold w-12 text-center">
                  {scoreUs}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setScoreUs(scoreUs + 1)}
                >
                  +
                </Button>
              </div>
            </div>
            <span className="text-muted-foreground text-2xl font-light">—</span>
            <div className="text-center">
              <Label className="text-xs text-muted-foreground">EUX</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setScoreThem(Math.max(0, scoreThem - 1))}
                >
                  -
                </Button>
                <span className="text-4xl font-bold w-12 text-center">
                  {scoreThem}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() => setScoreThem(scoreThem + 1)}
                >
                  +
                </Button>
              </div>
            </div>
          </div>

          {/* Timer */}
          <div className="flex flex-col items-center gap-3">
            <span className="text-3xl font-mono font-bold tabular-nums">
              {formatTime(matchTime)}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={isRunning ? "destructive" : "default"}
                onClick={() => setIsRunning(!isRunning)}
              >
                {isRunning ? (
                  <>
                    <Pause className="h-4 w-4 mr-1" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1" />
                    Démarrer
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsRunning(false);
                  setMatchTime(0);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Réinitialiser
              </Button>
            </div>
          </div>

          {/* Players on pitch */}
          <div>
            <h4 className="text-sm font-medium mb-2">
              Joueurs sur le terrain ({players.length})
            </h4>
            <div className="flex flex-wrap gap-2">
              {players.slice(0, 11).map((player) => (
                <Badge
                  key={player.id}
                  variant="secondary"
                  className="text-sm"
                >
                  {player.shirt_number && `#${player.shirt_number} `}
                  {player.first_name} {player.last_name}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </RoleGuard>
  );
}

function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={className}>{children}</span>;
}
