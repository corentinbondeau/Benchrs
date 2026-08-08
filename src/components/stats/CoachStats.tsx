"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Trophy,
  Minus,
  Frown,
  Target,
  Shield,
  TrendingUp,
  Clock,
  CalendarCheck,
  Users,
  Activity,
} from "lucide-react";

interface MatchRow {
  id: string;
  title: string;
  opponent: string | null;
  event_date: string;
  score_us: number | null;
  score_them: number | null;
  match_result: "win" | "loss" | "draw" | null;
  status: string;
}

interface PlayerMinRow {
  player_id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  minutes: number;
  matches: number;
  goals: number;
}

interface EventAttendanceRow {
  event_id: string;
  title: string;
  event_date: string;
  type: string;
  present: number;
  total: number;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

function resultColor(result: string | null) {
  if (result === "win") return "bg-green-100 text-green-700 border-green-200";
  if (result === "loss") return "bg-red-100 text-red-700 border-red-200";
  if (result === "draw") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-muted text-muted-foreground border-muted";
}

function resultLabel(result: string | null) {
  if (result === "win") return "V";
  if (result === "loss") return "D";
  if (result === "draw") return "N";
  return "—";
}

export function CoachStats() {
  const { currentTeam } = useTeam();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [playerMinutes, setPlayerMinutes] = useState<PlayerMinRow[]>([]);
  const [attendance, setAttendance] = useState<EventAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    const team = currentTeam;

    async function fetchData() {
      const [matchesRes, statsRes, eventsRes, attRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, opponent, event_date, score_us, score_them, match_result, status")
          .eq("team_id", team.id)
          .eq("type", "match")
          .order("event_date", { ascending: true }),
        supabase
          .from("match_stats")
          .select(
            "player_id, minutes_played, goals, player:profiles!match_stats_player_id_fkey(id, first_name, last_name, shirt_number)"
          )
          .eq("team_id", team.id),
        supabase
          .from("events")
          .select("id, title, event_date, type")
          .eq("team_id", team.id)
          .in("type", ["training", "match"]),
        supabase
          .from("attendances")
          .select("event_id, status")
          .eq("team_id", team.id),
      ]);

      setMatches((matchesRes.data as MatchRow[]) || []);

      // Temps de jeu par joueur
      const minMap = new Map<
        string,
        { first_name: string; last_name: string; shirt_number: number | null; minutes: number; matches: number; goals: number }
      >();
      for (const s of statsRes.data || []) {
        const pid = s.player_id as string;
        const p = s.player as unknown as { first_name: string; last_name: string; shirt_number: number | null } | null;
        if (!p) continue;
        const cur = minMap.get(pid) || {
          first_name: p.first_name,
          last_name: p.last_name,
          shirt_number: p.shirt_number,
          minutes: 0,
          matches: 0,
          goals: 0,
        };
        cur.minutes += (s.minutes_played as number) || 0;
        cur.matches += 1;
        cur.goals += (s.goals as number) || 0;
        minMap.set(pid, cur);
      }
      setPlayerMinutes(
        Array.from(minMap.entries()).map(([player_id, v]) => ({ player_id, ...v }))
      );

      // Assiduité par événement
      const attMap = new Map<string, { present: number; total: number }>();
      for (const a of attRes.data || []) {
        const eid = a.event_id as string;
        if (!attMap.has(eid)) attMap.set(eid, { present: 0, total: 0 });
        const e = attMap.get(eid)!;
        e.total += 1;
        if (a.status === "present" || a.status === "late") e.present += 1;
      }
      const attRows: EventAttendanceRow[] = (eventsRes.data || [])
        .map((ev) => {
          const c = attMap.get(ev.id as string);
          return {
            event_id: ev.id as string,
            title: (ev.title as string) || (ev.type === "training" ? "Entraînement" : "Match"),
            event_date: ev.event_date as string,
            type: ev.type as string,
            present: c?.present ?? 0,
            total: c?.total ?? 0,
          };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
        .slice(0, 10);
      setAttendance(attRows);

      setLoading(false);
    }

    fetchData();
  }, [currentTeam]);

  if (!currentTeam) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-royal)] border-t-transparent" />
      </div>
    );
  }

  const completed = matches.filter(
    (m) => m.status === "completed" && m.score_us !== null && m.score_them !== null
  );
  const wins = completed.filter((m) => m.match_result === "win").length;
  const draws = completed.filter((m) => m.match_result === "draw").length;
  const losses = completed.filter((m) => m.match_result === "loss").length;
  const goalsFor = completed.reduce((a, m) => a + (m.score_us ?? 0), 0);
  const goalsAgainst = completed.reduce((a, m) => a + (m.score_them ?? 0), 0);
  const goalDiff = goalsFor - goalsAgainst;

  const recent = [...completed]
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
    .slice(0, 6);

  const chartData = completed.map((m) => ({
    label: formatShortDate(m.event_date),
    Marqués: m.score_us ?? 0,
    Encaissés: m.score_them ?? 0,
  }));

  const maxMinutes = Math.max(1, ...playerMinutes.map((p) => p.minutes));
  const sortedMinutes = [...playerMinutes].sort((a, b) => b.minutes - a.minutes);

  const bilan = [
    { icon: Trophy, label: "Victoires", value: wins, color: "text-green-600", bg: "bg-green-50" },
    { icon: Minus, label: "Nuls", value: draws, color: "text-amber-600", bg: "bg-amber-50" },
    { icon: Frown, label: "Défaites", value: losses, color: "text-red-600", bg: "bg-red-50" },
    { icon: Target, label: "Buts marqués", value: goalsFor, color: "text-[var(--color-gold)]", bg: "bg-amber-50" },
    { icon: Shield, label: "Buts encaissés", value: goalsAgainst, color: "text-blue-600", bg: "bg-blue-50" },
    { icon: TrendingUp, label: "Différence", value: goalDiff > 0 ? `+${goalDiff}` : goalDiff, color: goalDiff >= 0 ? "text-green-600" : "text-red-600", bg: goalDiff >= 0 ? "bg-green-50" : "bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Bilan de la saison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--color-royal)]" />
            Bilan de la saison
          </CardTitle>
        </CardHeader>
        <CardContent>
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun match terminé avec score. Saisis les scores pour alimenter le bilan.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {bilan.map((s) => (
                  <div key={s.label} className="rounded-lg border p-3 text-center">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${s.bg} mx-auto mb-2`}>
                      <s.icon className={`h-4 w-4 ${s.color}`} />
                    </div>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {completed.length} match{completed.length > 1 ? "s" : ""} joué{completed.length > 1 ? "s" : ""} ·{" "}
                {(goalsFor / completed.length).toFixed(1)} buts marqués / match ·{" "}
                {(goalsAgainst / completed.length).toFixed(1)} encaissés / match
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Forme récente */}
      {recent.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--color-royal)]" />
              Forme récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {recent.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                  <Badge className={resultColor(m.match_result)}>{resultLabel(m.match_result)}</Badge>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate max-w-[120px]">
                      {m.opponent || m.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatShortDate(m.event_date)} · {m.score_us}-{m.score_them}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Buts par match */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--color-gold)]" />
              Buts par match
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={26} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Marqués" fill="var(--color-royal)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Encaissés" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Temps de jeu par joueur */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--color-royal)]" />
            Temps de jeu par joueur
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedMinutes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune minute enregistrée. Saisis les stats des matchs.
            </p>
          ) : (
            <div className="space-y-2">
              {sortedMinutes.map((p) => {
                const pct = Math.round((p.minutes / maxMinutes) * 100);
                return (
                  <div key={p.player_id} className="flex items-center gap-3">
                    <span className="w-32 truncate text-sm font-medium shrink-0">
                      {p.first_name} {p.last_name}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct < 30 ? "bg-red-400" : pct < 60 ? "bg-amber-400" : "bg-[var(--color-royal)]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs text-muted-foreground shrink-0">
                      {p.minutes}&apos; · {p.matches} m
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assiduité par événement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-[var(--color-royal)]" />
            Assiduité par événement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attendance.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune réponse de présence enregistrée.
            </p>
          ) : (
            <div className="space-y-2">
              {attendance.map((e) => {
                const pct = e.total > 0 ? Math.round((e.present / e.total) * 100) : 0;
                return (
                  <div key={e.event_id} className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {e.title}
                        <span className="text-xs text-muted-foreground font-normal ml-1">
                          ({e.type === "training" ? "entraînement" : "match"}) · {formatShortDate(e.event_date)}
                        </span>
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                          {pct}% ({e.present}/{e.total})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
