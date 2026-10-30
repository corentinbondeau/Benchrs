"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  BarChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "@/components/charts";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Target,
  Clock,
  Star,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MatchDataRow {
  event_id: string;
  event_date: string | null;
  opponent: string | null;
  title: string | null;
  score_us: number | null;
  score_them: number | null;
  match_result: string | null;
  goals: number;
  assists: number;
  minutes_played: number;
  rating: number | null;
}

interface Averages {
  goals: number;
  assists: number;
  minutes: number;
  rating: number | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function resultLabel(row: MatchDataRow): { text: string; className: string } {
  // Essai via match_result
  if (row.match_result) {
    if (row.match_result === "win")
      return { text: "V", className: "bg-green-100 text-green-700" };
    if (row.match_result === "loss")
      return { text: "D", className: "bg-red-100 text-red-700" };
    if (row.match_result === "draw")
      return { text: "N", className: "bg-amber-100 text-amber-700" };
  }
  // Calcul depuis le score
  if (row.score_us !== null && row.score_them !== null) {
    if (row.score_us > row.score_them)
      return { text: "V", className: "bg-green-100 text-green-700" };
    if (row.score_us < row.score_them)
      return { text: "D", className: "bg-red-100 text-red-700" };
    return { text: "N", className: "bg-amber-100 text-amber-700" };
  }
  return { text: "—", className: "bg-muted text-muted-foreground" };
}

function scoreText(row: MatchDataRow): string {
  if (row.score_us !== null && row.score_them !== null)
    return `${row.score_us} - ${row.score_them}`;
  return "—";
}

// ─── TrendIndicator ─────────────────────────────────────────────────────────────

function TrendIndicator({
  value,
  average,
  higherIsBetter = true,
}: {
  value: number;
  average: number;
  higherIsBetter?: boolean;
}) {
  const diff = value - average;
  const threshold = average * 0.05; // 5% de marge

  if (Math.abs(diff) <= threshold || average === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        moy.
      </span>
    );
  }

  const isUp = diff > 0;
  const isPositive = higherIsBetter ? isUp : !isUp;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive ? "text-green-600" : "text-red-600"
      }`}
    >
      {isUp ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {isUp ? "+" : ""}
      {diff.toFixed(1)}
    </span>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PlayerProgressionPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const { currentTeam } = useTeam();

  const [matches, setMatches] = useState<MatchDataRow[]>([]);
  const [averages, setAverages] = useState<Averages>({
    goals: 0,
    assists: 0,
    minutes: 0,
    rating: null,
  });
  const [playerName, setPlayerName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    const team = currentTeam;

    async function load() {
      setLoading(true);

      // 1. Nom du joueur
      const { data: profileData } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", playerId)
        .single();

      if (profileData) {
        setPlayerName(`${profileData.first_name} ${profileData.last_name}`);
      }

      // 2. match_stats des 20 derniers matchs
      const { data: statsData } = await supabase
        .from("match_stats")
        .select("event_id, goals, assists, minutes_played")
        .eq("player_id", playerId)
        .eq("team_id", team.id)
        .order("event_id", { ascending: false })
        .limit(20);

      if (!statsData || statsData.length === 0) {
        setLoading(false);
        return;
      }

      const eventIds = [...new Set(statsData.map((s) => s.event_id as string))];

      // 3. Infos des matchs (events)
      const { data: eventsData } = await supabase
        .from("events")
        .select(
          "id, event_date, opponent, title, score_us, score_them, match_result, status"
        )
        .in("id", eventIds)
        .eq("type", "match");

      const evMap = new Map(
        (eventsData || []).map((e) => [
          e.id as string,
          e as {
            id: string;
            event_date: string | null;
            opponent: string | null;
            title: string | null;
            score_us: number | null;
            score_them: number | null;
            match_result: string | null;
            status: string | null;
          },
        ])
      );

      // 4. Notes coach (match_ratings)
      const { data: ratingsData } = await supabase
        .from("match_ratings")
        .select("event_id, rating")
        .eq("player_id", playerId)
        .eq("team_id", team.id)
        .in("event_id", eventIds);

      const ratingsMap = new Map<string, number>();
      for (const r of ratingsData || []) {
        ratingsMap.set(r.event_id as string, Number(r.rating));
      }

      // 5. Construction des lignes + tri chronologique
      const rows: MatchDataRow[] = statsData
        .map((s) => {
          const ev = evMap.get(s.event_id as string);
          return {
            event_id: s.event_id as string,
            event_date: ev?.event_date ?? null,
            opponent: ev?.opponent ?? null,
            title: ev?.title ?? null,
            score_us: ev?.score_us ?? null,
            score_them: ev?.score_them ?? null,
            match_result: ev?.match_result ?? null,
            goals: (s.goals as number) || 0,
            assists: (s.assists as number) || 0,
            minutes_played: (s.minutes_played as number) || 0,
            rating: ratingsMap.get(s.event_id as string) ?? null,
          };
        })
        .filter((r) => r.event_date !== null) // on ne garde que les matchs datés
        .sort(
          (a, b) =>
            new Date(a.event_date!).getTime() -
            new Date(b.event_date!).getTime()
        );

      setMatches(rows);

      // 6. Calcul des moyennes
      const n = rows.length;
      if (n > 0) {
        const ratedRows = rows.filter((r) => r.rating !== null);
        setAverages({
          goals: rows.reduce((acc, r) => acc + r.goals, 0) / n,
          assists: rows.reduce((acc, r) => acc + r.assists, 0) / n,
          minutes: rows.reduce((acc, r) => acc + r.minutes_played, 0) / n,
          rating:
            ratedRows.length > 0
              ? ratedRows.reduce((acc, r) => acc + r.rating!, 0) /
                ratedRows.length
              : null,
        });
      }

      setLoading(false);
    }

    load();
  }, [playerId, currentTeam]);

  // ─── Données pour les graphiques ─────────────────────────────────────────────

  const lineData = matches.map((m) => ({
    date: formatDateShort(m.event_date),
    Minutes: m.minutes_played,
    ...(m.rating !== null ? { Note: m.rating } : {}),
  }));

  // Buts cumulés sur la courbe (LineChart)
  let cumGoals = 0;
  const lineDataWithCum = matches.map((m) => {
    cumGoals += m.goals;
    return {
      date: formatDateShort(m.event_date),
      Minutes: m.minutes_played,
      "Buts cumulés": cumGoals,
      ...(m.rating !== null ? { Note: m.rating } : {}),
    };
  });

  const barData = matches.map((m) => ({
    date: formatDateShort(m.event_date),
    Buts: m.goals,
    Passes: m.assists,
  }));

  // Totaux pour le résumé en haut
  const totalGoals = matches.reduce((acc, m) => acc + m.goals, 0);
  const totalAssists = matches.reduce((acc, m) => acc + m.assists, 0);
  const totalMinutes = matches.reduce((acc, m) => acc + m.minutes_played, 0);
  const lastMatch = matches[matches.length - 1];

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  if (!currentTeam) return null;

  return (
    <div className="section-gap">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/stats/${playerId}`}
          aria-label="Retour à la fiche joueur"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted transition-colors -ml-2"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Progression</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {playerName || "Joueur"} — {matches.length} dernier
            {matches.length > 1 ? "s" : ""} match
            {matches.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-royal)] border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!loading && matches.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">
              Aucun match enregistré pour ce joueur.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Contenu principal */}
      {!loading && matches.length > 0 && (
        <div className="space-y-6">
          {/* ── Résumé rapide ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 mx-auto mb-2">
                  <Trophy className="h-5 w-5 text-[var(--color-gold)]" />
                </div>
                <p className="text-2xl font-bold">{totalGoals}</p>
                <p className="text-xs text-muted-foreground">Buts</p>
                <div className="mt-1">
                  <TrendIndicator
                    value={lastMatch?.goals ?? 0}
                    average={averages.goals}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 mx-auto mb-2">
                  <Target className="h-5 w-5 text-[var(--color-royal)]" />
                </div>
                <p className="text-2xl font-bold">{totalAssists}</p>
                <p className="text-xs text-muted-foreground">Passes déc.</p>
                <div className="mt-1">
                  <TrendIndicator
                    value={lastMatch?.assists ?? 0}
                    average={averages.assists}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 mx-auto mb-2">
                  <Clock className="h-5 w-5 text-purple-600" />
                </div>
                <p className="text-2xl font-bold">{totalMinutes}</p>
                <p className="text-xs text-muted-foreground">Minutes totales</p>
                <div className="mt-1">
                  <TrendIndicator
                    value={lastMatch?.minutes_played ?? 0}
                    average={averages.minutes}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 mx-auto mb-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                </div>
                <p className="text-2xl font-bold">
                  {averages.rating !== null
                    ? averages.rating.toFixed(1)
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Note moy.</p>
                {averages.rating !== null && lastMatch?.rating !== null && (
                  <div className="mt-1">
                    <TrendIndicator
                      value={lastMatch?.rating ?? averages.rating}
                      average={averages.rating}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── LineChart : minutes + buts cumulés + note ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--color-royal)]" />
                Évolution match par match
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={lineDataWithCum}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 10]}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="Minutes"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="Buts cumulés"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                    {lineData.some((d) => "Note" in d) && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="Note"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        strokeDasharray="4 2"
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-muted-foreground text-center mt-1">
                Minutes & buts cumulés (axe gauche) · Note coach /10 (axe droit, pointillé)
              </p>
            </CardContent>
          </Card>

          {/* ── BarChart : buts et passes par match ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
                Buts &amp; passes par match
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Buts" fill="#22c55e" radius={[3, 3, 0, 0]} />
                    <Bar
                      dataKey="Passes"
                      fill="#3b82f6"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* ── Tableau récapitulatif ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                Détail par match
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6 w-24">Date</TableHead>
                      <TableHead>Adversaire</TableHead>
                      <TableHead className="text-center w-16">Score</TableHead>
                      <TableHead className="text-center w-12">Résultat</TableHead>
                      <TableHead className="text-center w-16">Min.</TableHead>
                      <TableHead className="text-center w-14">Buts</TableHead>
                      <TableHead className="text-center w-14">Passes</TableHead>
                      <TableHead className="text-center w-14 pr-6">Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...matches].reverse().map((m) => {
                      const res = resultLabel(m);
                      return (
                        <TableRow key={m.event_id}>
                          <TableCell className="pl-6 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(m.event_date)}
                          </TableCell>
                          <TableCell className="text-sm max-w-[140px] truncate">
                            {m.opponent || m.title || "—"}
                          </TableCell>
                          <TableCell className="text-center text-xs">
                            {scoreText(m)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              className={`text-[10px] px-1.5 py-0.5 font-semibold border-0 ${res.className}`}
                            >
                              {res.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm font-medium">
                            {m.minutes_played}
                            <span className="text-xs text-muted-foreground">
                              &apos;
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`text-sm font-bold ${m.goals > 0 ? "text-green-600" : "text-muted-foreground"}`}
                            >
                              {m.goals}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`text-sm font-bold ${m.assists > 0 ? "text-blue-600" : "text-muted-foreground"}`}
                            >
                              {m.assists}
                            </span>
                          </TableCell>
                          <TableCell className="text-center pr-6">
                            {m.rating !== null ? (
                              <span className="text-sm font-semibold text-sky-600">
                                {m.rating.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Ligne moyennes */}
                    <TableRow className="bg-muted/40 font-medium border-t-2">
                      <TableCell
                        className="pl-6 text-xs text-muted-foreground"
                        colSpan={4}
                      >
                        Moyenne / match
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {averages.minutes.toFixed(0)}&apos;
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {averages.goals.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {averages.assists.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center text-xs pr-6">
                        {averages.rating !== null
                          ? averages.rating.toFixed(1)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
