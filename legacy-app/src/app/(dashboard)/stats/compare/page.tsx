"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scale, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
  Tooltip,
} from "@/components/charts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Profile } from "@/types";

interface PlayerAgg {
  goals: number;
  assists: number;
  matches: number;
  minutes: number;
  presence: number;
}

interface Data {
  players: Profile[];
  aggs: Map<string, PlayerAgg>;
}

const METRICS = [
  { key: "Buts", label: "Buts" },
  { key: "Passes", label: "Passes décisives" },
  { key: "Matchs", label: "Matchs joués" },
  { key: "Minutes", label: "Minutes" },
  { key: "Présence", label: "Assiduité" },
] as const;

export default function ComparePage() {
  const { currentTeam } = useTeam();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");

  const loadData = useCallback(async (): Promise<Data | null> => {
    if (!currentTeam) return null;
    const supabase = createClient();
    const [membersRes, statsRes, eventsRes, attRes] = await Promise.all([
      supabase.from("team_members").select("user_id").eq("team_id", currentTeam.id).in("role", ["player"]),
      supabase.from("match_stats").select("player_id, event_id, goals, assists, minutes_played").eq("team_id", currentTeam.id),
      supabase.from("events").select("id, type").eq("team_id", currentTeam.id).eq("type", "training"),
      supabase.from("attendances").select("event_id, user_id, status").eq("team_id", currentTeam.id),
    ]);
    const memberIds = (membersRes.data || []).map((m) => m.user_id);
    let players: Profile[] = [];
    if (memberIds.length > 0) {
      const { data: p } = await supabase.from("profiles").select("*").in("id", memberIds).order("last_name", { ascending: true });
      players = (p as Profile[]) || [];
    }
    const trainingIds = new Set((eventsRes.data || []).map((e) => e.id));
    const rawStats = (statsRes.data || []) as { player_id: string; event_id: string; goals: number; assists: number; minutes_played: number }[];
    const rawAtt = (attRes.data || []) as { event_id: string; user_id: string; status: string }[];
    const aggs = new Map<string, PlayerAgg>();
    for (const id of memberIds) {
      aggs.set(id, { goals: 0, assists: 0, matches: 0, minutes: 0, presence: 0 });
    }
    for (const s of rawStats) {
      const a = aggs.get(s.player_id);
      if (!a) continue;
      a.goals += s.goals || 0;
      a.assists += s.assists || 0;
      a.matches += 1;
      a.minutes += s.minutes_played || 0;
    }
    for (const id of memberIds) {
      const own = rawAtt.filter((r) => r.user_id === id && trainingIds.has(r.event_id));
      const present = own.filter((r) => r.status === "present" || r.status === "late").length;
      const a = aggs.get(id);
      if (a && own.length > 0) a.presence = Math.round((present / own.length) * 100);
    }
    return { players, aggs };
  }, [currentTeam?.id]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (!cancelled && res) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const radarData = useMemo(() => {
    if (!data || !playerA || !playerB) return [];
    const a = data.aggs.get(playerA);
    const b = data.aggs.get(playerB);
    if (!a || !b) return [];
    return METRICS.map((m) => {
      const va = m.key === "Buts" ? a.goals : m.key === "Passes" ? a.assists : m.key === "Matchs" ? a.matches : m.key === "Minutes" ? a.minutes : a.presence;
      const vb = m.key === "Buts" ? b.goals : m.key === "Passes" ? b.assists : m.key === "Matchs" ? b.matches : m.key === "Minutes" ? b.minutes : b.presence;
      const max = Math.max(va, vb, 1);
      return { metric: m.label, A: Math.round((va / max) * 100), B: Math.round((vb / max) * 100), aVal: va, bVal: vb };
    });
  }, [data, playerA, playerB]);

  const nameOf = (id: string) => {
    const p = data?.players.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : "Joueur";
  };

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Scale className="h-5 w-5 text-[var(--color-royal)]" />
          Comparer les joueurs
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sélectionne deux joueurs pour comparer leurs stats côte à côte.
        </p>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[var(--color-royal)]">Joueur A</p>
              <Select value={playerA} onValueChange={(v) => setPlayerA(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un joueur" />
                </SelectTrigger>
                <SelectContent>
                  {data.players.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[var(--color-gold)]">Joueur B</p>
              <Select value={playerB} onValueChange={(v) => setPlayerB(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un joueur" />
                </SelectTrigger>
                <SelectContent>
                  {data.players
                    .filter((p) => p.id !== playerA)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {playerA && playerB && radarData.length > 0 ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Radar comparatif</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData} outerRadius="75%">
                      <PolarGrid />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                      <Radar name={nameOf(playerA)} dataKey="A" stroke="var(--color-royal)" fill="var(--color-royal)" fillOpacity={0.4} />
                      <Radar name={nameOf(playerB)} dataKey="B" stroke="#F6C453" fill="#F6C453" fillOpacity={0.4} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Chiffres clés</CardTitle>
                </CardHeader>
                <CardContent className="p-0 divide-y">
                  {METRICS.map((m) => {
                    const row = radarData.find((r) => r.metric === m.label)!;
                    const aWins = row.aVal > row.bVal;
                    const bWins = row.bVal > row.aVal;
                    return (
                      <div key={m.key} className="grid grid-cols-3 items-center gap-2 px-4 py-2.5 text-center">
                        <p className={`text-sm font-bold ${aWins ? "text-[var(--color-royal)]" : "text-muted-foreground"}`}>
                          {row.aVal}
                        </p>
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                        <p className={`text-sm font-bold ${bWins ? "text-[var(--color-gold)]" : "text-muted-foreground"}`}>
                          {row.bVal}
                        </p>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-10 text-center">
                <Scale className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Sélectionne deux joueurs pour afficher la comparaison.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
