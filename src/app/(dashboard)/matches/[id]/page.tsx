"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Swords,
  Target,
  AlertTriangle,
  Minus,
  TrendingUp,
  Shield,
  Pencil,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { Event, MatchStat, Formation, MatchLineup, Profile } from "@/types";

type MatchEvent = Event & { meeting_time: string | null };

interface PlayerStat extends MatchStat {
  profile?: Profile;
}

interface LineupEntry extends MatchLineup {
  profile?: Profile;
}

interface FormationData {
  positions: { player_id: string; x: number; y: number; label: string }[];
  captain_id?: string;
}

const FORMATION_POSITIONS: Record<string, { x: number; y: number; label: string }[]> = {
  "4-3-3": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 20, y: 72, label: "DG" },
    { x: 40, y: 75, label: "DC" },
    { x: 60, y: 75, label: "DC" },
    { x: 80, y: 72, label: "DD" },
    { x: 30, y: 52, label: "MDC" },
    { x: 50, y: 48, label: "MC" },
    { x: 70, y: 52, label: "MC" },
    { x: 20, y: 28, label: "AG" },
    { x: 50, y: 25, label: "BU" },
    { x: 80, y: 28, label: "AD" },
  ],
  "4-4-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 20, y: 72, label: "DG" },
    { x: 40, y: 75, label: "DC" },
    { x: 60, y: 75, label: "DC" },
    { x: 80, y: 72, label: "DD" },
    { x: 20, y: 48, label: "MG" },
    { x: 40, y: 52, label: "MC" },
    { x: 60, y: 52, label: "MC" },
    { x: 80, y: 48, label: "MD" },
    { x: 35, y: 25, label: "BU" },
    { x: 65, y: 25, label: "BU" },
  ],
};

function getResultColor(result: string | null) {
  if (result === "win") return "bg-green-100 text-green-700 border-green-200";
  if (result === "loss") return "bg-red-100 text-red-700 border-red-200";
  if (result === "draw") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

function getResultLabel(result: string | null) {
  if (result === "win") return "Victoire";
  if (result === "loss") return "Défaite";
  if (result === "draw") return "Nul";
  return "—";
}

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";
  const matchId = params.id as string;

  const [match, setMatch] = useState<MatchEvent | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [formation, setFormation] = useState<Formation | null>(null);
  const [lineups, setLineups] = useState<LineupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStats, setEditingStats] = useState(false);
  const [statsForm, setStatsForm] = useState<Record<string, { goals: number; assists: number; yellow_cards: number; red_cards: number; minutes_played: number }>>({});
  const [savingStats, setSavingStats] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function fetchMatchData() {
      const [matchRes, statsRes, formRes, lineupsRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .eq("id", matchId)
          .single(),
        supabase
          .from("match_stats")
          .select("*, profile:profiles!match_stats_player_id_fkey(id, first_name, last_name, shirt_number, position)")
          .eq("event_id", matchId),
        supabase
          .from("formations")
          .select("*")
          .eq("event_id", matchId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("match_lineups")
          .select("*, profile:profiles!match_lineups_player_id_fkey(id, first_name, last_name, shirt_number, position)")
          .eq("event_id", matchId),
      ]);

      setMatch(matchRes.data as MatchEvent | null);
      setPlayerStats((statsRes.data as PlayerStat[]) || []);
      setFormation(formRes.data as Formation | null);
      setLineups((lineupsRes.data as LineupEntry[]) || []);
      setLoading(false);
    }

    fetchMatchData();
  }, [matchId]);

  function initStatsForm() {
    const form: Record<string, { goals: number; assists: number; yellow_cards: number; red_cards: number; minutes_played: number }> = {};
    for (const l of lineups) {
      const existing = playerStats.find((s) => s.player_id === l.player_id);
      form[l.player_id] = {
        goals: existing?.goals || 0,
        assists: existing?.assists || 0,
        yellow_cards: existing?.yellow_cards || 0,
        red_cards: existing?.red_cards || 0,
        minutes_played: existing?.minutes_played || 0,
      };
    }
    setStatsForm(form);
    setEditingStats(true);
  }

  async function saveStats() {
    setSavingStats(true);
    const supabase = createClient();

    for (const [playerId, stats] of Object.entries(statsForm)) {
      const existing = playerStats.find((s) => s.player_id === playerId);
      if (existing) {
        await supabase
          .from("match_stats")
          .update({
            goals: stats.goals,
            assists: stats.assists,
            yellow_cards: stats.yellow_cards,
            red_cards: stats.red_cards,
            minutes_played: stats.minutes_played,
          })
          .eq("id", existing.id);
      } else {
        const hasData = stats.goals > 0 || stats.assists > 0 || stats.yellow_cards > 0 || stats.red_cards > 0 || stats.minutes_played > 0;
        if (hasData) {
          await supabase.from("match_stats").insert({
            event_id: matchId,
            player_id: playerId,
            goals: stats.goals,
            assists: stats.assists,
            yellow_cards: stats.yellow_cards,
            red_cards: stats.red_cards,
            minutes_played: stats.minutes_played,
          });
        }
      }
    }

    const { data: refreshed } = await supabase
      .from("match_stats")
      .select("*, profile:profiles!match_stats_player_id_fkey(id, first_name, last_name, shirt_number, position)")
      .eq("event_id", matchId);

    setPlayerStats((refreshed as PlayerStat[]) || []);
    setEditingStats(false);
    setSavingStats(false);
    toast.success("Stats enregistrées");
  }

  function updateStatField(playerId: string, field: string, value: number) {
    setStatsForm((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: Math.max(0, value) },
    }));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          Match introuvable
        </div>
      </div>
    );
  }

  const matchDate = new Date(match.event_date);
  const starters = lineups.filter((l) => l.is_starter);
  const subs = lineups.filter((l) => !l.is_starter);
  const fd = formation?.formation_data as FormationData | null;
  const positions = fd?.positions || [];
  const captainId = fd?.captain_id;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retour
      </Button>

      {/* Match Header */}
      <Card className="bg-gradient-to-r from-[var(--color-navy)] to-[var(--color-royal)] text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={getResultColor(match.match_result)}>
                  {getResultLabel(match.match_result)}
                </Badge>
                <span className="text-white/60 text-sm">
                  {matchDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
              <h2 className="text-2xl font-bold">{match.title}</h2>
              {match.opponent && (
                <p className="text-white/80 text-lg">vs {match.opponent}</p>
              )}
            </div>
            {match.score_us !== null && match.score_them !== null && (
              <div className="text-center">
                <div className="inline-flex items-center gap-3 rounded-xl bg-white/20 px-6 py-3">
                  <span className="text-4xl font-bold">{match.score_us}</span>
                  <Minus className="h-6 w-6 text-white/60" />
                  <span className="text-4xl font-bold">{match.score_them}</span>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm text-white/70">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {matchDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {match.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {match.location}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Formation / Pitch */}
        {positions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-[var(--color-royal)]" />
                Composition — {formation?.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mx-auto max-w-xs">
                <div className="relative aspect-[2/3] rounded-lg bg-green-700 overflow-hidden">
                  <div
                    className="absolute inset-0 pointer-events-none overflow-hidden"
                    style={{
                      backgroundImage: "repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px, transparent 40px, transparent 80px)",
                    }}
                  />
                  <svg viewBox="0 0 300 450" className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="none">
                    <rect x="8" y="8" width="284" height="434" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" rx="2" />
                    <line x1="8" y1="225" x2="292" y2="225" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                    <circle cx="150" cy="225" r="50" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                    <circle cx="150" cy="225" r="3" fill="rgba(255,255,255,0.5)" />
                    <rect x="75" y="8" width="150" height="80" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                    <rect x="75" y="362" width="150" height="80" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
                  </svg>
                  {positions.map((pos, i) => {
                    const pid = pos.player_id;
                    const player = lineups.find((l) => l.player_id === pid)?.profile;
                    const isCapt = captainId === pid;
                    return (
                      <div
                        key={i}
                        className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-bold shadow-lg ${
                          isCapt
                            ? "bg-yellow-400 text-black ring-2 ring-yellow-300"
                            : "bg-[var(--color-royal)] text-white"
                        }`}>
                          {player?.shirt_number ?? "?"}
                        </div>
                        <span className="mt-0.5 text-[8px] font-medium text-white/80 text-center max-w-[60px] truncate drop-shadow">
                          {player ? `${player.first_name.charAt(0)}. ${player.last_name}` : pos.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Player Stats */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-[var(--color-gold)]" />
                Stats du match
              </CardTitle>
              {isCoach && lineups.length > 0 && (
                editingStats ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingStats(false)}>
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      className="bg-[var(--color-gold)] text-[var(--color-navy)]"
                      onClick={saveStats}
                      disabled={savingStats}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {savingStats ? "..." : "Enregistrer"}
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={initStatsForm}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Modifier
                  </Button>
                )
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingStats ? (
              <div className="space-y-2">
                {lineups.map((l) => {
                  const p = l.profile;
                  const s = statsForm[l.player_id];
                  if (!s) return null;
                  return (
                    <div key={l.player_id} className="flex items-center gap-2 rounded-lg border p-2">
                      <div className="flex items-center gap-2 min-w-[120px] shrink-0">
                        <span className="font-bold text-xs w-6 text-center">{p?.shirt_number ?? "?"}</span>
                        <span className="truncate text-xs">{p?.first_name} {p?.last_name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground w-4 text-center">B</Label>
                          <Input
                            type="number"
                            min={0}
                            value={s.goals}
                            onChange={(e) => updateStatField(l.player_id, "goals", parseInt(e.target.value) || 0)}
                            className="h-7 w-12 text-center text-xs px-1"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground w-4 text-center">P</Label>
                          <Input
                            type="number"
                            min={0}
                            value={s.assists}
                            onChange={(e) => updateStatField(l.player_id, "assists", parseInt(e.target.value) || 0)}
                            className="h-7 w-12 text-center text-xs px-1"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-yellow-500 w-3 text-center">J</Label>
                          <Input
                            type="number"
                            min={0}
                            max={2}
                            value={s.yellow_cards}
                            onChange={(e) => updateStatField(l.player_id, "yellow_cards", parseInt(e.target.value) || 0)}
                            className="h-7 w-12 text-center text-xs px-1"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-red-500 w-3 text-center">R</Label>
                          <Input
                            type="number"
                            min={0}
                            max={1}
                            value={s.red_cards}
                            onChange={(e) => updateStatField(l.player_id, "red_cards", parseInt(e.target.value) || 0)}
                            className="h-7 w-12 text-center text-xs px-1"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-[10px] text-muted-foreground w-6 text-center">Min</Label>
                          <Input
                            type="number"
                            min={0}
                            max={90}
                            value={s.minutes_played}
                            onChange={(e) => updateStatField(l.player_id, "minutes_played", parseInt(e.target.value) || 0)}
                            className="h-7 w-14 text-center text-xs px-1"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : playerStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Aucune stats enregistrée
              </p>
            ) : (
              <ScrollArea className="w-full">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-2 pr-2 font-medium">Joueur</th>
                      <th className="text-center py-2 px-1 font-medium">
                        <span className="inline-flex items-center gap-0.5"><Target className="h-3 w-3" />B</span>
                      </th>
                      <th className="text-center py-2 px-1 font-medium">
                        <span className="inline-flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />P</span>
                      </th>
                      <th className="text-center py-2 px-1 font-medium">
                        <span className="inline-flex items-center gap-0.5"><AlertTriangle className="h-3 w-3 text-yellow-500" /></span>
                      </th>
                      <th className="text-center py-2 px-1 font-medium">
                        <span className="inline-flex items-center gap-0.5"><AlertTriangle className="h-3 w-3 text-red-500" /></span>
                      </th>
                      <th className="text-center py-2 pl-1 font-medium">Min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((ps) => {
                      const p = ps.profile;
                      return (
                        <tr key={ps.id} className="border-b last:border-0">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-xs">{p?.shirt_number ?? "?"}</span>
                              <span className="truncate text-xs">{p?.first_name} {p?.last_name}</span>
                            </div>
                          </td>
                          <td className="text-center py-2 px-1 text-xs font-bold">{ps.goals || "-"}</td>
                          <td className="text-center py-2 px-1 text-xs">{ps.assists || "-"}</td>
                          <td className="text-center py-2 px-1 text-xs">
                            {ps.yellow_cards ? <span className="inline-block h-3 w-2.5 rounded-sm bg-yellow-400" /> : "-"}
                          </td>
                          <td className="text-center py-2 px-1 text-xs">
                            {ps.red_cards ? <span className="inline-block h-3 w-2.5 rounded-sm bg-red-500" /> : "-"}
                          </td>
                          <td className="text-center py-2 pl-1 text-xs text-muted-foreground">{ps.minutes_played || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lineups */}
      {lineups.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Titulaires ({starters.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {starters.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                    <span className="font-bold text-xs w-6 text-center">{l.profile?.shirt_number ?? "?"}</span>
                    <span className="flex-1 truncate">{l.profile?.first_name} {l.profile?.last_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{l.position_label}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Remplaçants ({subs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {subs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Aucun remplaçant</p>
              ) : (
                <div className="space-y-1">
                  {subs.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
                      <span className="font-bold text-xs w-6 text-center">{l.profile?.shirt_number ?? "?"}</span>
                      <span className="flex-1 truncate">{l.profile?.first_name} {l.profile?.last_name}</span>
                      {l.entered_at_minute !== null && (
                        <Badge variant="outline" className="text-[10px]">Entrée {l.entered_at_minute}'</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
