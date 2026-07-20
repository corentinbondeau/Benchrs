"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Play, Pause, RotateCcw, Save, Plus, Minus, Circle, Square, CircleDot } from "lucide-react";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { useToast } from "@/hooks/use-toast";

interface MatchEvent {
  id: string;
  title: string;
  event_date: string;
  opponent: string | null;
  score_us: number | null;
  score_them: number | null;
  status: string;
}

interface PlayerProfile {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position: string | null;
}

interface PlayerStats {
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
}

export function MatchSheet() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const supabase = createClient();

  const [matches, setMatches] = useState<MatchEvent[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [matchTime, setMatchTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [scoreUs, setScoreUs] = useState(0);
  const [scoreThem, setScoreThem] = useState(0);
  const [playerStats, setPlayerStats] = useState<Record<string, PlayerStats>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [matchesRes, playersRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, event_date, opponent, score_us, score_them, status")
          .eq("type", "match")
          .order("event_date", { ascending: false }),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, shirt_number, position")
          .eq("role", "player")
          .eq("is_active", true)
          .order("shirt_number"),
      ]);
      setMatches((matchesRes.data as MatchEvent[]) || []);
      setPlayers((playersRes.data as PlayerProfile[]) || []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const loadMatchData = useCallback(async (matchId: string) => {
    if (!matchId) return;
    const match = matches.find((m) => m.id === matchId);
    if (match) {
      setScoreUs(match.score_us || 0);
      setScoreThem(match.score_them || 0);
    }
    const { data: stats } = await supabase
      .from("match_stats")
      .select("player_id, goals, assists, yellow_cards, red_cards")
      .eq("event_id", matchId);
    if (stats) {
      const map: Record<string, PlayerStats> = {};
      stats.forEach((s) => {
        map[s.player_id] = {
          goals: s.goals || 0,
          assists: s.assists || 0,
          yellow_cards: s.yellow_cards || 0,
          red_cards: s.red_cards || 0,
        };
      });
      setPlayerStats(map);
    }
  }, [matches, supabase]);

  useEffect(() => {
    if (selectedMatchId) loadMatchData(selectedMatchId);
  }, [selectedMatchId, loadMatchData]);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isRunning) {
      interval = setInterval(() => setMatchTime((p) => p + 1), 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isRunning]);

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, []);

  function updatePlayerStat(playerId: string, field: keyof PlayerStats, delta: number) {
    setPlayerStats((prev) => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] || {}),
        [field]: Math.max(0, ((prev[playerId]?.[field] as number) || 0) + delta),
      },
    }));
  }

  async function handleSave() {
    if (!selectedMatchId) {
      toast({ title: "Erreur", description: "Sélectionnez un match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await supabase
        .from("events")
        .update({ score_us: scoreUs, score_them: scoreThem })
        .eq("id", selectedMatchId);

      for (const [playerId, stats] of Object.entries(playerStats)) {
        if (stats.goals > 0 || stats.assists > 0 || stats.yellow_cards > 0 || stats.red_cards > 0) {
          await supabase
            .from("match_stats")
            .upsert({
              event_id: selectedMatchId,
              player_id: playerId,
              goals: stats.goals,
              assists: stats.assists,
              yellow_cards: stats.yellow_cards,
              red_cards: stats.red_cards,
              minutes_played: Math.floor(matchTime / 60),
            }, { onConflict: "event_id,player_id" });
        }
      }

      toast({ title: "Sauvegardé", description: "Stats du match enregistrées" });
    } catch (e) {
      toast({ title: "Erreur", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feuillet de match</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Match selector */}
          <div className="space-y-2">
            <Label>Sélectionner un match</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
            >
              <option value="">-- Choisir un match --</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} {m.opponent ? `vs ${m.opponent}` : ""} — {new Date(m.event_date).toLocaleDateString("fr-FR")}
                </option>
              ))}
            </select>
          </div>

          {selectedMatchId && (
            <>
              {/* Score */}
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <Label className="text-xs text-muted-foreground">NOUS</Label>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setScoreUs(Math.max(0, scoreUs - 1))}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold w-12 text-center">{scoreUs}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setScoreUs(scoreUs + 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <span className="text-muted-foreground text-2xl font-light">—</span>
                <div className="text-center">
                  <Label className="text-xs text-muted-foreground">EUX</Label>
                  <div className="flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setScoreThem(Math.max(0, scoreThem - 1))}>
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-4xl font-bold w-12 text-center">{scoreThem}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setScoreThem(scoreThem + 1)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Timer */}
              <div className="flex flex-col items-center gap-3">
                <span className="text-3xl font-mono font-bold tabular-nums">{formatTime(matchTime)}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant={isRunning ? "destructive" : "default"} onClick={() => setIsRunning(!isRunning)}>
                    {isRunning ? <><Pause className="h-4 w-4 mr-1" />Pause</> : <><Play className="h-4 w-4 mr-1" />Démarrer</>}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setIsRunning(false); setMatchTime(0); }}>
                    <RotateCcw className="h-4 w-4 mr-1" />Réinitialiser
                  </Button>
                </div>
              </div>

              {/* Player stats */}
              <div>
                <h4 className="text-sm font-medium mb-3">Stats joueurs</h4>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {players.map((player) => {
                    const ps = playerStats[player.id] || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 };
                    return (
                      <div key={player.id} className="flex items-center gap-3 rounded-lg border p-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold shrink-0">
                          {player.shirt_number || "?"}
                        </div>
                        <span className="text-sm font-medium flex-1 truncate">
                          {player.first_name} {player.last_name}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="But" onClick={() => updatePlayerStat(player.id, "goals", 1)}>
                            <CircleDot className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <span className="text-xs w-4 text-center">{ps.goals}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Passe" onClick={() => updatePlayerStat(player.id, "assists", 1)}>
                            <Circle className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                          <span className="text-xs w-4 text-center">{ps.assists}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Carton jaune" onClick={() => updatePlayerStat(player.id, "yellow_cards", 1)}>
                            <div className="h-3.5 w-2.5 rounded-sm bg-yellow-400" />
                          </Button>
                          <span className="text-xs w-4 text-center">{ps.yellow_cards}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Carton rouge" onClick={() => updatePlayerStat(player.id, "red_cards", 1)}>
                            <div className="h-3.5 w-2.5 rounded-sm bg-red-600" />
                          </Button>
                          <span className="text-xs w-4 text-center">{ps.red_cards}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Save */}
              <Button onClick={handleSave} disabled={saving} className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90">
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Enregistrement..." : "Enregistrer le match"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </RoleGuard>
  );
}
