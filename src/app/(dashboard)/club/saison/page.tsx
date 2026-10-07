"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy, Goal, TrendingUp, Shield, Medal, Swords, Users } from "lucide-react";
import { currentSeasonLabel, previousSeasonLabel, seasonDateRange } from "@/lib/goals";

interface SeasonEvent {
  id: string;
  team_id: string;
  title: string;
  opponent: string | null;
  event_date: string;
  score_us: number | null;
  score_them: number | null;
  match_result: "win" | "loss" | "draw" | null;
}

interface PlayerStat {
  id: string;
  name: string;
  value: number;
}

interface TeamTrophies {
  team_id: string;
  team_name: string;
  count: number;
}

interface Stats {
  events: SeasonEvent[];
  teamNames: Record<string, string>;
  v: number;
  n: number;
  d: number;
  bp: number;
  bc: number;
  bestAttack: { team_id: string; goals: number } | null;
  bestDefense: { team_id: string; against: number } | null;
  record: SeasonEvent | null;
  topScorers: PlayerStat[];
  topAssists: PlayerStat[];
  mvps: PlayerStat[];
  trophies: TeamTrophies[];
  attendance_pct: number | null;
}

const RESPONDED = ["present", "late", "absent", "excused"];
const ATTENDED = ["present", "late"];

const EMPTY: Stats = {
  events: [],
  teamNames: {},
  v: 0,
  n: 0,
  d: 0,
  bp: 0,
  bc: 0,
  bestAttack: null,
  bestDefense: null,
  record: null,
  topScorers: [],
  topAssists: [],
  mvps: [],
  trophies: [],
  attendance_pct: null,
};

export default function ClubSaisonPage() {
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [stats, setStats] = useState<Stats>(EMPTY);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);

  const current = currentSeasonLabel();
  const seasonOptions = [current, previousSeasonLabel(current), previousSeasonLabel(previousSeasonLabel(current)), previousSeasonLabel(previousSeasonLabel(previousSeasonLabel(current)))];
  const [season, setSeason] = useState<string>(current);

  const load = useCallback(
    async (cid: string, saison: string) => {
      const range = seasonDateRange(saison);
      if (!range) return EMPTY;

      const { data: teamsData } = await supabaseRef.current.from("teams").select("id, name").eq("club_id", cid);
      const teams = ((teamsData || []) as { id: string; name: string }[]).map((t) => t.id);
      const teamNames = Object.fromEntries(
        ((teamsData || []) as { id: string; name: string }[]).map((t) => [t.id, t.name])
      );
      if (teams.length === 0) return { ...EMPTY, teamNames };

      const { data: eventsData } = await supabaseRef.current
        .from("events")
        .select("id, team_id, title, opponent, event_date, score_us, score_them, match_result")
        .in("team_id", teams)
        .eq("type", "match")
        .eq("status", "completed")
        .gte("event_date", range.start.toISOString())
        .lte("event_date", range.end.toISOString())
        .order("event_date", { ascending: true });
      const events = ((eventsData || []) as Record<string, unknown>[]).map((e) => ({
        id: e.id as string,
        team_id: e.team_id as string,
        title: e.title as string,
        opponent: (e.opponent as string | null) ?? null,
        event_date: e.event_date as string,
        score_us: (e.score_us as number | null) ?? null,
        score_them: (e.score_them as number | null) ?? null,
        match_result: (e.match_result as SeasonEvent["match_result"]) ?? null,
      }));
      if (events.length === 0) return { ...EMPTY, teamNames };
      const eventIds = events.map((e) => e.id);
      const eventIdSet = new Set(eventIds);

      const v = events.filter((e) => e.match_result === "win").length;
      const n = events.filter((e) => e.match_result === "draw").length;
      const d = events.filter((e) => e.match_result === "loss").length;
      const bp = events.reduce((acc, e) => acc + (e.score_us ?? 0), 0);
      const bc = events.reduce((acc, e) => acc + (e.score_them ?? 0), 0);

      const perTeam = new Map<string, { goals: number; against: number }>();
      for (const e of events) {
        const acc = perTeam.get(e.team_id) ?? { goals: 0, against: 0 };
        acc.goals += e.score_us ?? 0;
        acc.against += e.score_them ?? 0;
        perTeam.set(e.team_id, acc);
      }
      let bestAttack: { team_id: string; goals: number } | null = null;
      let bestDefense: { team_id: string; against: number } | null = null;
      for (const [tid, acc] of perTeam) {
        if (!bestAttack || acc.goals > bestAttack.goals) bestAttack = { team_id: tid, goals: acc.goals };
        if (!bestDefense || acc.against < bestDefense.against)
          bestDefense = { team_id: tid, against: acc.against };
      }
      let record: SeasonEvent | null = null;
      for (const e of events) {
        if (e.score_us == null || e.score_them == null) continue;
        const diff = e.score_us - e.score_them;
        if (!record || diff > (record.score_us! - record.score_them!)) record = e;
      }

      // Statistiques joueurs (buts / passes) sur les matchs de la saison.
      const { data: statsData } = await supabaseRef.current
        .from("match_stats")
        .select("player_id, goals, assists")
        .in("event_id", eventIds);
      const goalsBy = new Map<string, number>();
      const assistsBy = new Map<string, number>();
      for (const s of statsData || []) {
        const row = s as { player_id: string; goals: number; assists: number };
        goalsBy.set(row.player_id, (goalsBy.get(row.player_id) ?? 0) + (row.goals || 0));
        assistsBy.set(row.player_id, (assistsBy.get(row.player_id) ?? 0) + (row.assists || 0));
      }

      // MVP = votes cumulés sur les matchs de la saison.
      const { data: motmData } = await supabaseRef.current
        .from("motm_votes")
        .select("candidate_id, event_id")
        .in("event_id", eventIds);
      const mvpsBy = new Map<string, number>();
      for (const mv of motmData || []) {
        const row = mv as { candidate_id: string; event_id: string };
        if (!eventIdSet.has(row.event_id)) continue;
        mvpsBy.set(row.candidate_id, (mvpsBy.get(row.candidate_id) ?? 0) + 1);
      }

      // Palmarès : trophées remis lors des matchs de la saison, par équipe.
      const { data: trophiesByEvent } = await supabaseRef.current
        .from("trophies")
        .select("id, event_id, awarded_to")
        .in("event_id", eventIds);
      const trophyIds = ((trophiesByEvent || []) as { awarded_to: string }[])
        .map((t) => t.awarded_to)
        .filter((x): x is string => Boolean(x));
      const perTeamTrophies = new Map<string, number>();
      for (const ev of trophiesByEvent || []) {
        const row = ev as { event_id: string; awarded_to: string | null };
        const teamEv = events.find((e) => e.id === row.event_id);
        if (!teamEv || !row.awarded_to) continue;
        perTeamTrophies.set(teamEv.team_id, (perTeamTrophies.get(teamEv.team_id) ?? 0) + 1);
      }
      const trophies: TeamTrophies[] = [...perTeamTrophies.entries()]
        .map(([tid, count]) => ({ team_id: tid, team_name: teamNames[tid] ?? "Équipe", count }))
        .sort((a, b) => b.count - a.count);

      // Assiduité globale sur les matchs de la saison.
      const { data: attData } = await supabaseRef.current
        .from("attendances")
        .select("status")
        .in("event_id", eventIds)
        .in("status", RESPONDED);
      let responded = 0;
      let attended = 0;
      for (const a of attData || []) {
        responded += 1;
        if (ATTENDED.includes((a as { status: string }).status)) attended += 1;
      }
      const attendance_pct = responded > 0 ? Math.round((attended / responded) * 100) : null;

      // Noms des joueurs (buteurs, passeurs, MVP, trophées).
      const needIds = [...new Set([...goalsBy.keys(), ...assistsBy.keys(), ...mvpsBy.keys(), ...trophyIds])];
      let nameMap = new Map<string, string>();
      if (needIds.length > 0) {
        const { data: profiles } = await supabaseRef.current
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", needIds);
        nameMap = new Map(
          ((profiles || []) as { id: string; first_name: string | null; last_name: string | null }[]).map((p) => [
            p.id,
            `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Joueur",
          ])
        );
      }
      const fmt = (m: Map<string, number>): PlayerStat[] =>
        [...m.entries()]
          .map(([id, value]) => ({ id, name: nameMap.get(id) ?? "Joueur", value }))
          .filter((s) => s.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

      return {
        events,
        teamNames,
        v,
        n,
        d,
        bp,
        bc,
        bestAttack,
        bestDefense,
        record,
        topScorers: fmt(goalsBy),
        topAssists: fmt(assistsBy),
        mvps: fmt(mvpsBy),
        trophies,
        attendance_pct,
      };
    },
    []
  );

  useEffect(() => {
    if (!clubId) return;
    load(clubId, season).then((res) => {
      setStats(res);
      setPageLoading(false);
    });
  }, [clubId, season, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  const heroCards = [
    { label: "Matchs joués", value: stats.events.length, icon: Swords },
    { label: "Victoires", value: stats.v, icon: Trophy },
    { label: "Nuls", value: stats.n, icon: Medal },
    { label: "Défaites", value: stats.d, icon: Shield },
    { label: "Buts marqués", value: stats.bp, icon: Goal },
    { label: "Buts encaissés", value: stats.bc, icon: Shield },
  ];

  return (
    <ClubPageShell
      title="La saison en chiffres"
      subtitle="La rétrospective du club"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || pageLoading}
      comiteOnly
      actions={
        <Select value={season} onValueChange={(v) => {
          setSeason(v ?? current);
          setPageLoading(true);
        }}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {seasonOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {stats.events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Aucun match joué cette saison.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Hero */}
          <Card>
            <CardContent className="grid grid-cols-3 gap-3 p-4 md:grid-cols-6">
              {heroCards.map((c) => (
                <div key={c.label} className="text-center">
                  <c.icon className="h-4 w-4 mx-auto mb-1 text-[var(--color-royal)]" />
                  <p className="text-2xl font-bold">{c.value}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Records + attaque/défense */}
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold flex items-center gap-1">
                  <TrendingUp className="h-4 w-4 text-[var(--color-royal)]" />
                  Meilleure attaque
                </p>
                {stats.bestAttack ? (
                  <p className="text-2xl font-bold mt-1">
                    {stats.teamNames[stats.bestAttack.team_id] ?? "Équipe"}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">{stats.bestAttack?.goals ?? 0} buts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold flex items-center gap-1">
                  <Shield className="h-4 w-4 text-[var(--color-royal)]" />
                  Meilleure défense
                </p>
                {stats.bestDefense ? (
                  <p className="text-2xl font-bold mt-1">
                    {stats.teamNames[stats.bestDefense.team_id] ?? "Équipe"}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">{stats.bestDefense?.against ?? 0} buts encaissés</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold flex items-center gap-1">
                  <Swords className="h-4 w-4 text-[var(--color-royal)]" />
                  Plus large victoire
                </p>
                {stats.record ? (
                  <>
                    <p className="text-2xl font-bold mt-1 tabular-nums">
                      {stats.record.score_us} - {stats.record.score_them}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats.record.opponent?.trim() || stats.record.title}
                    </p>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>

          {/* Top buteurs / passeurs / MVP */}
          <div className="grid gap-3 md:grid-cols-3">
            <RankingCard title="Top buteurs" icon={Goal} rows={stats.topScorers} />
            <RankingCard title="Top passeurs" icon={Users} rows={stats.topAssists} />
            <RankingCard title="Joueurs du match (MVP)" icon={Medal} rows={stats.mvps} />
          </div>

          {/* Palmarès par équipe */}
          {stats.trophies.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <Trophy className="h-4 w-4 text-[var(--color-royal)]" />
                  Palmarès par équipe
                </p>
                <div className="flex flex-wrap gap-2">
                  {stats.trophies.map((t) => (
                    <Badge key={t.team_id} variant="secondary" className="text-sm">
                      {t.team_name} · {t.count} trophée{t.count > 1 ? "s" : ""}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Assiduité moyenne du club sur les matchs de la saison :{" "}
            {stats.attendance_pct != null ? `${stats.attendance_pct}%` : "—"}
          </p>
        </div>
      )}
    </ClubPageShell>
  );
}

function RankingCard({ title, icon: Icon, rows }: { title: string; icon: typeof Goal; rows: PlayerStat[] }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold mb-2 flex items-center gap-1">
          <Icon className="h-4 w-4 text-[var(--color-royal)]" />
          {title}
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Pas encore de données.</p>
        ) : (
          <ol className="space-y-1">
            {rows.map((r, i) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground mr-1">{i + 1}.</span>
                  {r.name}
                </span>
                <Badge variant={i === 0 ? "default" : "outline"}>{r.value}</Badge>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}