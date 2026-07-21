"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Play,
  Pause,
  RotateCcw,
  Save,
  Plus,
  Minus,
  Circle,
  CircleDot,
  ArrowRightLeft,
  Timer,
  Flag,
} from "lucide-react";
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

interface LiveEvent {
  type: string;
  player_id: string | null;
  related_player_id: string | null;
  minute: number;
  notes?: string;
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
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [playerStats, setPlayerStats] = useState<Record<string, { goals: number; assists: number; yellow_cards: number; red_cards: number; minutes_played: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showGoalDialog, setShowGoalDialog] = useState(false);
  const [showSubDialog, setShowSubDialog] = useState(false);
  const [goalScorer, setGoalScorer] = useState("");
  const [goalAssister, setGoalAssister] = useState("");
  const [subOut, setSubOut] = useState("");
  const [subIn, setSubIn] = useState("");
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

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

  useEffect(() => {
    if (!selectedMatchId) return;
    let cancelled = false;
    (async () => {
      const match = matches.find((m) => m.id === selectedMatchId);
      if (match && !cancelled) {
        setScoreUs(match.score_us || 0);
        setScoreThem(match.score_them || 0);
      }
      const { data: stats } = await supabase
        .from("match_stats")
        .select("player_id, goals, assists, yellow_cards, red_cards, minutes_played")
        .eq("event_id", selectedMatchId);
      if (stats && !cancelled) {
        const map: Record<string, { goals: number; assists: number; yellow_cards: number; red_cards: number; minutes_played: number }> = {};
        stats.forEach((s) => {
          map[s.player_id] = {
            goals: s.goals || 0,
            assists: s.assists || 0,
            yellow_cards: s.yellow_cards || 0,
            red_cards: s.red_cards || 0,
            minutes_played: s.minutes_played || 0,
          };
        });
        setPlayerStats(map);
      }
      const { data: events } = await supabase
        .from("match_events")
        .select("*")
        .eq("event_id", selectedMatchId)
        .order("minute", { ascending: true });
      if (events && !cancelled) {
        setLiveEvents(events.map((e) => ({
          type: e.event_type,
          player_id: e.player_id,
          related_player_id: e.related_player_id,
          minute: e.minute || 0,
          notes: e.notes,
        })));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedMatchId]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => setMatchTime((p) => p + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, []);

  const currentMinute = Math.floor(matchTime / 60);

  function addLiveEvent(type: string, player_id: string | null, related_player_id?: string | null) {
    setLiveEvents((prev) => [...prev, { type, player_id, related_player_id: related_player_id || null, minute: currentMinute }]);
  }

  function handleGoal() {
    if (!goalScorer) return;
    addLiveEvent("goal", goalScorer, goalAssister);
    setScoreUs((s) => s + 1);
    setPlayerStats((prev) => ({
      ...prev,
      [goalScorer]: { ...(prev[goalScorer] || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0 }), goals: (prev[goalScorer]?.goals || 0) + 1 },
    }));
    if (goalAssister) {
      setPlayerStats((prev) => ({
        ...prev,
        [goalAssister]: { ...(prev[goalAssister] || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0 }), assists: (prev[goalAssister]?.assists || 0) + 1 },
      }));
    }
    setShowGoalDialog(false);
    setGoalScorer("");
    setGoalAssister("");
  }

  function handleCard(playerId: string, type: "yellow_card" | "red_card") {
    addLiveEvent(type, playerId);
    setPlayerStats((prev) => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0 }),
        [type === "yellow_card" ? "yellow_cards" : "red_cards"]:
          (prev[playerId]?.[type === "yellow_card" ? "yellow_cards" : "red_cards"] || 0) + 1,
      },
    }));
  }

  function handleSubstitution() {
    if (!subOut || !subIn) return;
    addLiveEvent("substitution_out", subOut, subIn);
    setShowSubDialog(false);
    setSubOut("");
    setSubIn("");
  }

  function handleHalfTime() {
    addLiveEvent("half_time", null);
    setIsRunning(false);
  }

  function handleFullTime() {
    addLiveEvent("full_time", null);
    setIsRunning(false);
  }

  async function handleSave() {
    if (!selectedMatchId) {
      toast({ title: "Erreur", description: "Sélectionnez un match", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Save score
      await supabase
        .from("events")
        .update({ score_us: scoreUs, score_them: scoreThem, status: "completed" })
        .eq("id", selectedMatchId);

      // Save match stats
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
              minutes_played: stats.minutes_played || Math.floor(matchTime / 60),
            }, { onConflict: "event_id,player_id" });
        }
      }

      // Save live events
      for (const evt of liveEvents) {
        await supabase.from("match_events").insert({
          event_id: selectedMatchId,
          event_type: evt.type,
          player_id: evt.player_id,
          related_player_id: evt.related_player_id,
          minute: evt.minute,
          created_by: session?.user?.id,
        });
      }

      toast({ title: "Sauvegardé", description: "Rapport de match enregistré" });
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

  const eventTypeLabels: Record<string, string> = {
    goal: "⚽ But",
    assist: "🅰️ Passe",
    yellow_card: "🟨 Carton jaune",
    red_card: "🟥 Carton rouge",
    substitution_out: "🔄 Changement",
    half_time: "⏸️ Mi-temps",
    full_time: "🏁 Fin de match",
  };

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="h-4 w-4 text-[var(--gold)]" />
              Live Match Tracker
            </CardTitle>
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
                  <div className="flex flex-wrap gap-2 justify-center">
                    <Button size="sm" variant={isRunning ? "destructive" : "default"} onClick={() => setIsRunning(!isRunning)}>
                      {isRunning ? <><Pause className="h-4 w-4 mr-1" />Pause</> : <><Play className="h-4 w-4 mr-1" />Démarrer</>}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleHalfTime}>
                      <Flag className="h-4 w-4 mr-1" />Mi-temps
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleFullTime} className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90">
                      <Flag className="h-4 w-4 mr-1" />Fin
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setIsRunning(false); setMatchTime(0); }}>
                      <RotateCcw className="h-4 w-4 mr-1" />Reset
                    </Button>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setShowGoalDialog(true)}>
                    <CircleDot className="h-4 w-4 mr-1 text-green-600" />
                    But
                  </Button>
                  <Button variant="outline" onClick={() => setShowSubDialog(true)}>
                    <ArrowRightLeft className="h-4 w-4 mr-1" />
                    Changement
                  </Button>
                </div>

                {/* Goal dialog */}
                {showGoalDialog && (
                  <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                    <Label className="text-sm font-medium">Enregistrer un but</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Buteur</Label>
                        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={goalScorer} onChange={(e) => setGoalScorer(e.target.value)}>
                          <option value="">— Choisir —</option>
                          {players.map((p) => <option key={p.id} value={p.id}>{p.shirt_number ? `#${p.shirt_number} ` : ""}{p.first_name} {p.last_name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Passeur décisif</Label>
                        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={goalAssister} onChange={(e) => setGoalAssister(e.target.value)}>
                          <option value="">— Aucun —</option>
                          {players.filter((p) => p.id !== goalScorer).map((p) => <option key={p.id} value={p.id}>{p.shirt_number ? `#${p.shirt_number} ` : ""}{p.first_name} {p.last_name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleGoal} disabled={!goalScorer}>Valider</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowGoalDialog(false)}>Annuler</Button>
                    </div>
                  </div>
                )}

                {/* Substitution dialog */}
                {showSubDialog && (
                  <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                    <Label className="text-sm font-medium">Changement de joueur</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Sort de</Label>
                        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={subOut} onChange={(e) => setSubOut(e.target.value)}>
                          <option value="">— Choisir —</option>
                          {players.map((p) => <option key={p.id} value={p.id}>{p.shirt_number ? `#${p.shirt_number} ` : ""}{p.first_name} {p.last_name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Entre</Label>
                        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={subIn} onChange={(e) => setSubIn(e.target.value)}>
                          <option value="">— Choisir —</option>
                          {players.filter((p) => p.id !== subOut).map((p) => <option key={p.id} value={p.id}>{p.shirt_number ? `#${p.shirt_number} ` : ""}{p.first_name} {p.last_name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSubstitution} disabled={!subOut || !subIn}>Valider</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowSubDialog(false)}>Annuler</Button>
                    </div>
                  </div>
                )}

                {/* Player stats with quick card buttons */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Stats joueurs</h4>
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {players.map((player) => {
                      const ps = playerStats[player.id] || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0 };
                      return (
                        <div key={player.id} className="flex items-center gap-2 rounded-lg border p-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold shrink-0">
                            {player.shirt_number || "?"}
                          </div>
                          <span className="text-sm font-medium flex-1 truncate">
                            {player.first_name} {player.last_name}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="But" onClick={() => {
                              addLiveEvent("goal", player.id);
                              setScoreUs((s) => s + 1);
                              setPlayerStats((prev) => ({ ...prev, [player.id]: { ...(prev[player.id] || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0 }), goals: (prev[player.id]?.goals || 0) + 1 } }));
                            }}>
                              <CircleDot className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            <span className="text-xs w-4 text-center">{ps.goals}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Passe" onClick={() => {
                              addLiveEvent("assist", player.id);
                              setPlayerStats((prev) => ({ ...prev, [player.id]: { ...(prev[player.id] || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0, minutes_played: 0 }), assists: (prev[player.id]?.assists || 0) + 1 } }));
                            }}>
                              <Circle className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                            <span className="text-xs w-4 text-center">{ps.assists}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Carton jaune" onClick={() => handleCard(player.id, "yellow_card")}>
                              <div className="h-3.5 w-2.5 rounded-sm bg-yellow-400" />
                            </Button>
                            <span className="text-xs w-4 text-center">{ps.yellow_cards}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Carton rouge" onClick={() => handleCard(player.id, "red_card")}>
                              <div className="h-3.5 w-2.5 rounded-sm bg-red-600" />
                            </Button>
                            <span className="text-xs w-4 text-center">{ps.red_cards}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live event log */}
                {liveEvents.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-3">Journal du match</h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {liveEvents.map((evt, i) => {
                        const player = players.find((p) => p.id === evt.player_id);
                        return (
                          <div key={i} className="flex items-center gap-2 text-sm rounded-lg border p-2">
                            <Badge variant="outline" className="text-xs w-12 justify-center">{evt.minute}&apos;</Badge>
                            <span className="text-xs">{eventTypeLabels[evt.type] || evt.type}</span>
                            {player && <span className="text-xs font-medium">{player.first_name} {player.last_name}</span>}
                            {evt.related_player_id && (() => {
                              const rp = players.find((p) => p.id === evt.related_player_id);
                              return rp ? <span className="text-xs text-muted-foreground">→ {rp.first_name} {rp.last_name}</span> : null;
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Save */}
                <Button onClick={handleSave} disabled={saving} className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Enregistrement..." : "Enregistrer le rapport de match"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
