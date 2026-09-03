"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { notifyPhysicalTest } from "@/lib/playerAlerts";
import {
  fffCategoryFromBirthDate,
  normRangeFor,
  normStatusFor,
  NORM_LABELS,
  NORM_COLORS,
  FFF_VMA_NORMS,
  FFF_VMI_NORMS,
} from "@/lib/vmaNorms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "@/components/charts";
import {
  Trophy,
  Target,
  Clock,
  CalendarCheck,
  Zap,
  Gauge,
  Wind,
  Check,
  X,
  Phone,
  User,
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Activity,
  Star,
  ClipboardList,
  IdCard,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import type { EmergencyContact, PlayerPhysicalTest } from "@/types";
import { PersonalGoalsCard } from "@/components/stats/PersonalGoalsCard";
import { PlayerPaniniCard } from "@/components/stats/PlayerPaniniCard";
import { CareerHistoryCard } from "@/components/stats/CareerHistoryCard";
import { QuarterlyReportsCard } from "@/components/stats/QuarterlyReportsCard";
import { PlayerBadgesCard } from "@/components/stats/PlayerBadgesCard";
import { PlayerNotebookCard } from "@/components/stats/PlayerNotebookCard";
import { CoachNotesCard } from "@/components/stats/CoachNotesCard";
import { EmergencyInfoCard } from "@/components/stats/EmergencyInfoCard";
import { DisciplineCard } from "@/components/stats/DisciplineCard";
import { MedicalRecordCard } from "@/components/stats/MedicalRecordCard";
import { POSITIONS } from "@/lib/positions";
import { buildProfileAttributesPayload } from "@/lib/profile/buildProfileAttributesPayload";
interface PlayerStats {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  shirt_number: number | null;
  total_goals: number;
  total_assists: number;
  matches_played: number;
  total_minutes: number;
  attendance_rate: number;
  yellow_cards: number;
  red_cards: number;
}

interface ProfileData {
  id: string;
  role: "coach" | "player" | "parent";
  first_name: string;
  last_name: string;
  position: string | null;
  shirt_number: number | null;
  phone: string | null;
  date_of_birth: string | null;
  vma: number | null;
  vmi: number | null;
  preferred_foot?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  secondary_positions?: string[] | null;
  allergies?: string | null;
  licence_number?: string | null;
  emergency_contacts?: EmergencyContact[] | null;
}

interface MatchRow {
  event_id: string;
  event_date: string | null;
  opponent: string | null;
  title: string | null;
  score_us: number | null;
  score_them: number | null;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played: number;
}

interface SeasonTotals {
  goals: number;
  assists: number;
  matches: number;
  minutes: number;
}

interface RadarDatum {
  metric: string;
  Joueur: number;
  Moyenne: number;
  max: number;
}

const roleLabels: Record<ProfileData["role"], string> = {
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}/${d.getFullYear()}`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function seasonKey(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String(y + 1).slice(2)}`;
}

function previousSeason(season: string): string {
  const [y] = season.split("/");
  const n = parseInt(y, 10) - 1;
  return `${n}/${String(n + 1).slice(2)}`;
}

function PhysicalEvolutionChart({
  title,
  color,
  tests,
}: {
  title: string;
  color: string;
  tests: PlayerPhysicalTest[];
}) {
  const data = [...tests]
    .sort((a, b) => new Date(a.tested_at).getTime() - new Date(b.tested_at).getTime())
    .map((t) => ({ date: formatDateShort(t.tested_at), value: Number(t.value) }));
  const first = data[0];
  const last = data[data.length - 1];
  const delta = first && last ? last.value - first.value : null;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          {title}
        </p>
        {last && <span className="text-xs text-muted-foreground">Dernier : {last.value.toFixed(1)}</span>}
      </div>
      {delta !== null && delta !== 0 && (
        <p className={`text-xs font-medium ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
          {delta > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
          {delta > 0 ? "+" : ""}
          {delta.toFixed(1)} depuis le début
        </p>
      )}
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">Aucun test enregistré</p>
      ) : data.length === 1 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          Ajoute d&apos;autres tests pour voir la courbe d&apos;évolution
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip />
            <Line type="monotone" dataKey="value" name={title} stroke={color} strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

interface NotesChartPoint {
  label: string;
  Joueurs: number | null;
  Coach: number | null;
}

function NotesEvolutionChart({ points }: { points: NotesChartPoint[] }) {
  if (points.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">Aucune note pour l&apos;instant</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={points} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 10]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={32} />
        <Tooltip />
        <Line type="monotone" dataKey="Coach" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 2 }} connectNulls />
        <Line type="monotone" dataKey="Joueurs" stroke="#22c55e" strokeWidth={2} dot={{ r: 2 }} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PlayerProfile({ playerId }: { playerId: string }) {
  const { currentTeam, userRole } = useTeam();
  const { user } = useAuth();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [vma, setVma] = useState<number | null>(null);
  const [editingVma, setEditingVma] = useState(false);
  const [vmaInput, setVmaInput] = useState("");
  const [vmi, setVmi] = useState<number | null>(null);
  const [editingVmi, setEditingVmi] = useState(false);
  const [vmiInput, setVmiInput] = useState("");
  const [editingShirt, setEditingShirt] = useState(false);
  const [shirtInput, setShirtInput] = useState("");
  const [editingAttributes, setEditingAttributes] = useState(false);
  const [preferredFootInput, setPreferredFootInput] = useState("");
  const [positionInput, setPositionInput] = useState("");
  const [secondaryPositionsInput, setSecondaryPositionsInput] = useState<string[]>([]);
  const [physicalTests, setPhysicalTests] = useState<PlayerPhysicalTest[]>([]);
  const [matchRows, setMatchRows] = useState<MatchRow[]>([]);
  const [currentSeason, setCurrentSeason] = useState("");
  const [paniniOpen, setPaniniOpen] = useState(false);
  const [seasonTotals, setSeasonTotals] = useState<Record<string, SeasonTotals>>({});
  const [radarData, setRadarData] = useState<RadarDatum[]>([]);
  const [mvpCount, setMvpCount] = useState(0);
  const [notesData, setNotesData] = useState<NotesChartPoint[]>([]);
  const [isParentOfPlayer, setIsParentOfPlayer] = useState(false);

  const fffCategory = fffCategoryFromBirthDate(profile?.date_of_birth);
  const vmaNorm = normRangeFor(fffCategory, FFF_VMA_NORMS);
  const vmiNorm = normRangeFor(fffCategory, FFF_VMI_NORMS);
  const vmaStatus = normStatusFor(vma, vmaNorm);
  const vmiStatus = normStatusFor(vmi, vmiNorm);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    const team = currentTeam;

    async function fetchProfile() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, first_name, last_name, position, shirt_number, phone, date_of_birth, vma, vmi, preferred_foot, height_cm, weight_kg, secondary_positions, allergies, licence_number, emergency_contacts")
        .eq("id", playerId)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      const { data: membership } = await supabase
        .from("team_members")
        .select("role")
        .eq("user_id", playerId)
        .eq("team_id", team.id)
        .maybeSingle();

      const teamRole = membership?.role === "owner" ? "coach" : membership?.role;
      const role = (teamRole as ProfileData["role"] | null) || (profile.role as ProfileData["role"]);

      if (user?.id && user.id !== playerId) {
        const { data: parentLink } = await supabase
          .from("parent_student")
          .select("student_id")
          .eq("parent_id", user.id)
          .eq("student_id", playerId)
          .maybeSingle();
        setIsParentOfPlayer(!!parentLink);
      }

      setProfile({ ...(profile as unknown as ProfileData), role });
      setVma(profile.vma);
      setVmaInput(profile.vma?.toString() ?? "");
      setVmi(profile.vmi);
      setVmiInput(profile.vmi?.toString() ?? "");

      if (role !== "player") {
        setLoading(false);
        return;
      }

      const [matchStatsRes, trainingEventsRes, testsRes] = await Promise.all([
        supabase
          .from("match_stats")
          .select("event_id, goals, assists, yellow_cards, red_cards, minutes_played")
          .eq("player_id", playerId)
          .eq("team_id", team.id),
        supabase.from("events").select("id").eq("team_id", team.id).eq("type", "training"),
        supabase
          .from("player_physical_tests")
          .select("id, player_id, team_id, test_type, value, tested_at, notes, created_at")
          .eq("player_id", playerId)
          .eq("team_id", team.id)
          .order("tested_at", { ascending: true }),
      ]);

      setPhysicalTests((testsRes.data as PlayerPhysicalTest[]) || []);

      const matchStats = matchStatsRes.data;
      const trainingIds = (trainingEventsRes.data || []).map((e) => e.id);

      const { data: attendanceData } = trainingIds.length > 0
        ? await supabase
            .from("attendances")
            .select("status")
            .eq("user_id", playerId)
            .eq("team_id", team.id)
            .in("event_id", trainingIds)
        : { data: [] };

      let totalGoals = 0, totalAssists = 0, totalMinutes = 0, yellowCards = 0, redCards = 0;
      if (matchStats) {
        for (const s of matchStats) {
          totalGoals += (s.goals as number) || 0;
          totalAssists += (s.assists as number) || 0;
          totalMinutes += (s.minutes_played as number) || 0;
          yellowCards += (s.yellow_cards as number) || 0;
          redCards += (s.red_cards as number) || 0;
        }
      }

      let attendanceRate = 0;
      if (attendanceData && attendanceData.length > 0) {
        const present = attendanceData.filter((a) => a.status === "present" || a.status === "late").length;
        attendanceRate = Math.round((present / attendanceData.length) * 100);
      }

      setStats({
        player_id: playerId,
        first_name: profile.first_name,
        last_name: profile.last_name,
        position: profile.position,
        shirt_number: profile.shirt_number,
        total_goals: totalGoals,
        total_assists: totalAssists,
        matches_played: matchStats?.length || 0,
        total_minutes: totalMinutes,
        attendance_rate: attendanceRate,
        yellow_cards: yellowCards,
        red_cards: redCards,
      });

      // --- Détail par match + par saison ---
      const eventIds = [...new Set((matchStats || []).map((s) => s.event_id))];
      const { data: matchEvents } = eventIds.length > 0
        ? await supabase
            .from("events")
            .select("id, event_date, opponent, title, score_us, score_them")
            .in("id", eventIds)
        : { data: [] };
      const evMap = new Map((matchEvents || []).map((e) => [e.id, e]));

      const rows: MatchRow[] = (matchStats || []).map((s) => {
        const ev = evMap.get(s.event_id) as { event_date: string; opponent: string | null; title: string | null; score_us: number | null; score_them: number | null } | undefined;
        return {
          event_id: s.event_id,
          event_date: ev?.event_date ?? null,
          opponent: ev?.opponent ?? null,
          title: ev?.title ?? null,
          score_us: ev?.score_us ?? null,
          score_them: ev?.score_them ?? null,
          goals: (s.goals as number) || 0,
          assists: (s.assists as number) || 0,
          yellow_cards: (s.yellow_cards as number) || 0,
          red_cards: (s.red_cards as number) || 0,
          minutes_played: (s.minutes_played as number) || 0,
        };
      });
      rows.sort((a, b) => new Date(a.event_date ?? 0).getTime() - new Date(b.event_date ?? 0).getTime());
      setMatchRows(rows);

      const bySeason: Record<string, SeasonTotals> = {};
      for (const r of rows) {
        const sk = seasonKey(r.event_date);
        if (!sk) continue;
        if (!bySeason[sk]) bySeason[sk] = { goals: 0, assists: 0, matches: 0, minutes: 0 };
        bySeason[sk].goals += r.goals;
        bySeason[sk].assists += r.assists;
        bySeason[sk].matches += 1;
        bySeason[sk].minutes += r.minutes_played;
      }
      setSeasonTotals(bySeason);
      setCurrentSeason(seasonKey(new Date().toISOString()) || "");

      // --- Progression des notes (retour coach + notes joueurs) ---
      if (eventIds.length > 0) {
        const [prRes, crRes] = await Promise.all([
          supabase
            .from("match_player_ratings")
            .select("event_id, rating")
            .eq("player_id", playerId)
            .eq("team_id", team.id),
          supabase
            .from("match_ratings")
            .select("event_id, rating")
            .eq("player_id", playerId)
            .eq("team_id", team.id),
        ]);
        const byEvent = (data: { event_id: string; rating: number }[] | null) => {
          const m = new Map<string, number[]>();
          for (const x of data || []) {
            const eid = x.event_id as string;
            if (!m.has(eid)) m.set(eid, []);
            m.get(eid)!.push(Number(x.rating));
          }
          return m;
        };
        const playersMap = byEvent(prRes.data as { event_id: string; rating: number }[] | null);
        const coachMap = byEvent(crRes.data as { event_id: string; rating: number }[] | null);
        const avg = (arr: number[]) => +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
        setNotesData(
          rows.map((r) => ({
            label: r.event_date ? formatDateShort(r.event_date) : "—",
            Joueurs: playersMap.has(r.event_id) ? avg(playersMap.get(r.event_id)!) : null,
            Coach: coachMap.has(r.event_id) ? avg(coachMap.get(r.event_id)!) : null,
          }))
        );
      } else {
        setNotesData([]);
      }

      // --- Comparaison joueur vs moyenne de l'équipe (radar) ---
      const { data: teamStats } = await supabase
        .from("match_stats")
        .select("player_id, goals, assists, minutes_played")
        .eq("team_id", team.id);
      const { data: teamAttData } = trainingIds.length > 0
        ? await supabase.from("attendances").select("user_id, status").eq("team_id", team.id).in("event_id", trainingIds)
        : { data: [] };

      const agg = new Map<string, { goals: number; assists: number; matches: number; minutes: number }>();
      for (const s of teamStats || []) {
        const pid = s.player_id as string;
        if (!agg.has(pid)) agg.set(pid, { goals: 0, assists: 0, matches: 0, minutes: 0 });
        const e = agg.get(pid)!;
        e.goals += (s.goals as number) || 0;
        e.assists += (s.assists as number) || 0;
        e.minutes += (s.minutes_played as number) || 0;
        e.matches += 1;
      }
      const attAgg = new Map<string, { total: number; present: number }>();
      for (const a of teamAttData || []) {
        const uid = a.user_id as string;
        if (!attAgg.has(uid)) attAgg.set(uid, { total: 0, present: 0 });
        const e = attAgg.get(uid)!;
        e.total += 1;
        if (a.status === "present" || a.status === "late") e.present += 1;
      }

      const pv = agg.get(playerId) || { goals: 0, assists: 0, matches: 0, minutes: 0 };
      const pa = attAgg.get(playerId);
      const playerPresence = pa && pa.total > 0 ? (pa.present / pa.total) * 100 : 0;

      let tGoals = 0, tAssists = 0, tMatches = 0, tMinutes = 0, count = 0;
      for (const [pid, e] of agg) {
        if (pid === playerId) continue;
        tGoals += e.goals;
        tAssists += e.assists;
        tMatches += e.matches;
        tMinutes += e.minutes;
        count++;
      }
      let sumPresence = 0, presenceCount = 0;
      for (const [uid, e] of attAgg) {
        if (uid === playerId) continue;
        if (e.total > 0) {
          sumPresence += (e.present / e.total) * 100;
          presenceCount++;
        }
      }
      const avg = count > 0
        ? { goals: tGoals / count, assists: tAssists / count, matches: tMatches / count, minutes: tMinutes / count }
        : { goals: 0, assists: 0, matches: 0, minutes: 0 };
      const avgPresence = presenceCount > 0 ? sumPresence / presenceCount : 0;

      const metrics = [
        { label: "Buts", player: pv.goals, avg: avg.goals },
        { label: "Passes", player: pv.assists, avg: avg.assists },
        { label: "Minutes", player: pv.minutes, avg: avg.minutes },
        { label: "Matchs", player: pv.matches, avg: avg.matches },
        { label: "Présence", player: playerPresence, avg: avgPresence },
      ];
      setRadarData(
        metrics.map((m) => {
          const avgRound = Math.round(m.avg * 10) / 10;
          return {
            metric: `${m.label} (moy. ${avgRound})`,
            Joueur: m.player,
            Moyenne: avgRound,
            max: Math.max(m.player, avgRound, 1),
          };
        })
      );

      // --- MVP cumulés (joueur du match par match) ---
      const { data: mvpVotes } = await supabase
        .from("motm_votes")
        .select("event_id, candidate_id")
        .eq("team_id", team.id);
      const votesByEvent = new Map<string, Map<string, number>>();
      for (const v of mvpVotes || []) {
        const eid = v.event_id as string;
        if (!votesByEvent.has(eid)) votesByEvent.set(eid, new Map());
        const perEvent = votesByEvent.get(eid)!;
        const cid = v.candidate_id as string;
        perEvent.set(cid, (perEvent.get(cid) || 0) + 1);
      }
      let wins = 0;
      for (const perEvent of votesByEvent.values()) {
        const max = Math.max(0, ...perEvent.values());
        if (max > 0 && perEvent.get(playerId) === max) wins++;
      }
      setMvpCount(wins);

      setLoading(false);
    }

    fetchProfile();
  }, [playerId, currentTeam]);

  async function handleSaveVma() {
    const val = parseFloat(vmaInput);
    if (isNaN(val) || val <= 0 || val > 30) {
      toast.error("VMA invalide (doit être entre 1 et 30)");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("update_player_vma", {
      player_id: playerId,
      new_vma: val,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setVma(val);
    setEditingVma(false);
    setPhysicalTests((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        player_id: playerId,
        team_id: currentTeam!.id,
        test_type: "vma",
        value: val,
        tested_at: new Date().toISOString(),
        notes: null,
        created_by: null,
        created_at: new Date().toISOString(),
      },
    ]);
    toast.success("VMA mise à jour");
    if (playerId !== user?.id && currentTeam) {
      notifyPhysicalTest({
        playerId,
        playerName: `${profile?.first_name ?? "Joueur"} ${profile?.last_name ?? ""}`.trim(),
        testType: "vma",
        value: val,
        teamId: currentTeam.id,
      });
    }
  }

  async function handleSaveShirt() {
    const val = parseInt(shirtInput, 10);
    if (isNaN(val) || val < 0 || val > 99) {
      toast.error("Numéro invalide (0 à 99)");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("update_player_jersey", {
      player_id: playerId,
      new_shirt_number: val,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setStats((prev) => (prev ? { ...prev, shirt_number: val } : prev));
    setProfile((prev) => (prev ? { ...prev, shirt_number: val } : prev));
    setEditingShirt(false);
    toast.success("Numéro de maillot mis à jour");
  }

  async function handleSaveAttributes() {
    const payload = buildProfileAttributesPayload({
      preferredFoot: preferredFootInput,
      position: positionInput,
      secondaryPositions: secondaryPositionsInput,
    });
    const supabase = createClient();
    // 🚨 Garde anti-échec silencieux (RLS `profiles` UPDATE) : `is_global_coach()`
    // teste `profiles.role = 'coach'` (rôle GLOBAL), alors que `isCoach` ici est
    // dérivé de `team_members` (coach OU owner). Un owner non-coach-global verrait
    // l'UPDATE filtré par la RLS et affecter 0 ligne, sans erreur retournée par
    // Supabase. On vérifie donc explicitement que des lignes sont revenues.
    const { data, error } = await supabase
      .from("profiles")
      .update({
        preferred_foot: payload.preferred_foot,
        position: positionInput || null,
        secondary_positions: payload.secondary_positions,
      })
      .eq("id", playerId)
      .select();

    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Vous n'avez pas les droits pour modifier ce profil");
      return;
    }

    setProfile((prev) =>
      prev
        ? {
            ...prev,
            preferred_foot: payload.preferred_foot,
            position: positionInput || null,
            secondary_positions: payload.secondary_positions,
          }
        : prev
    );
    setStats((prev) => (prev ? { ...prev, position: positionInput || null } : prev));
    setEditingAttributes(false);
    toast.success("Profil mis à jour");
  }

  async function handleSaveVmi() {
    const val = parseFloat(vmiInput);
    if (isNaN(val) || val <= 0 || val > 30) {
      toast.error("VMI invalide (doit être entre 1 et 30)");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("update_player_vmi", {
      player_id: playerId,
      new_vmi: val,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setVmi(val);
    setEditingVmi(false);
    setPhysicalTests((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        player_id: playerId,
        team_id: currentTeam!.id,
        test_type: "vmi",
        value: val,
        tested_at: new Date().toISOString(),
        notes: null,
        created_by: null,
        created_at: new Date().toISOString(),
      },
    ]);
    toast.success("VMI mise à jour");
    if (playerId !== user?.id && currentTeam) {
      notifyPhysicalTest({
        playerId,
        playerName: `${profile?.first_name ?? "Joueur"} ${profile?.last_name ?? ""}`.trim(),
        testType: "vmi",
        value: val,
        teamId: currentTeam.id,
      });
    }
  }

  if (!currentTeam) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-royal)] border-t-transparent" />
      </div>
    );
  }

  if (!profile) return null;

  const initials = `${profile.first_name[0]}${profile.last_name[0]}`;

  if (profile.role !== "player") {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-[var(--color-navy)] text-white p-5 md:p-6">
            <div className="flex items-center gap-5">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/10 text-xl font-bold shrink-0">
                {initials}
              </div>
              <div>
                <h2 className="text-xl font-bold">{profile.first_name} {profile.last_name}</h2>
                <p className="text-white/50 text-sm mt-0.5 capitalize">{roleLabels[profile.role]}</p>
              </div>
            </div>
        </div>

        {/* Contact */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Contact
            </p>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              {profile.phone ? (
                <a href={`tel:${profile.phone}`} className="hover:underline">
                  {profile.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">Téléphone non renseigné</span>
              )}
            </div>
            {profile.date_of_birth && (
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                {profile.date_of_birth}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { icon: Trophy, label: "Buts", value: stats.total_goals, color: "text-[var(--color-gold)]", bg: "bg-amber-50" },
    { icon: Target, label: "Passes", value: stats.total_assists, color: "text-[var(--color-royal)]", bg: "bg-blue-50" },
    { icon: CalendarCheck, label: "Matchs", value: stats.matches_played, color: "text-green-600", bg: "bg-green-50" },
    { icon: Clock, label: "Minutes", value: stats.total_minutes, color: "text-purple-600", bg: "bg-purple-50" },
    {
      icon: Zap, label: "Présence",
      value: `${stats.attendance_rate}%`,
      color: stats.attendance_rate >= 80 ? "text-green-600" : stats.attendance_rate >= 50 ? "text-amber-600" : "text-red-600",
      bg: stats.attendance_rate >= 80 ? "bg-green-50" : stats.attendance_rate >= 50 ? "bg-amber-50" : "bg-red-50",
    },
  ];

  const cur = seasonTotals[currentSeason] || { goals: 0, assists: 0, matches: 0, minutes: 0 };
  const prevSeason = currentSeason ? previousSeason(currentSeason) : "";
  const prev = prevSeason ? seasonTotals[prevSeason] || { goals: 0, assists: 0, matches: 0, minutes: 0 } : null;
  const seasonItems = [
    { label: "Buts", cur: cur.goals, prev: prev?.goals ?? null },
    { label: "Passes", cur: cur.assists, prev: prev?.assists ?? null },
    { label: "Matchs", cur: cur.matches, prev: prev?.matches ?? null },
    { label: "Minutes", cur: cur.minutes, prev: prev?.minutes ?? null },
  ];

  const vmaTests = physicalTests.filter((t) => t.test_type === "vma");
  const vmiTests = physicalTests.filter((t) => t.test_type === "vmi");

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-[var(--color-navy)] text-white p-5 md:p-6">
          <div className="flex items-center gap-5">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-xl bg-white/10 text-xl font-bold shrink-0">
              {editingShirt ? (
                <Input
                  autoFocus
                  type="number"
                  min={0}
                  max={99}
                  value={shirtInput}
                  onChange={(e) => setShirtInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveShirt();
                    if (e.key === "Escape") { setEditingShirt(false); }
                  }}
                  className="h-10 w-14 text-center text-lg font-bold text-white bg-white/20 border-white/40"
                />
              ) : (
                <>{stats.shirt_number || "?"}</>
              )}
              {isCoach && !editingShirt && (
                <button
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[var(--color-navy)] shadow"
                  onClick={() => {
                    setShirtInput(stats.shirt_number?.toString() ?? "");
                    setEditingShirt(true);
                  }}
                  title="Modifier le numéro de maillot"
                  aria-label="Modifier le numéro de maillot"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {editingShirt && (
                <div className="absolute -bottom-8 right-0 flex gap-1">
                  <button className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white" onClick={handleSaveShirt} aria-label="Valider">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white" onClick={() => setEditingShirt(false)} aria-label="Annuler">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{stats.first_name} {stats.last_name}</h2>
              {editingAttributes ? (
                <div className="mt-1 space-y-2">
                  <select
                    value={positionInput}
                    onChange={(e) => setPositionInput(e.target.value)}
                    aria-label="Poste principal"
                    className="h-8 w-full max-w-xs rounded-md border border-white/30 bg-white/10 px-2 text-sm text-white"
                  >
                    <option value="" className="text-black">Poste non renseigné</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos} className="text-black">
                        {pos}
                      </option>
                    ))}
                  </select>
                  <select
                    value={preferredFootInput}
                    onChange={(e) => setPreferredFootInput(e.target.value)}
                    aria-label="Pied fort"
                    className="h-8 w-full max-w-xs rounded-md border border-white/30 bg-white/10 px-2 text-sm text-white"
                  >
                    <option value="" className="text-black">Non renseigné</option>
                    <option value="Droit" className="text-black">Droit</option>
                    <option value="Gauche" className="text-black">Gauche</option>
                    <option value="Ambidextre" className="text-black">Ambidextre</option>
                  </select>
                  <div className="flex flex-wrap gap-1.5">
                    {POSITIONS.map((pos) => {
                      const active = secondaryPositionsInput.includes(pos);
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() =>
                            setSecondaryPositionsInput((prev) =>
                              active ? prev.filter((p) => p !== pos) : [...prev, pos]
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            active
                              ? "border-white bg-white/25 text-white"
                              : "border-white/30 text-white/60 hover:text-white"
                          }`}
                        >
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white"
                      onClick={handleSaveAttributes}
                      aria-label="Valider"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white"
                      onClick={() => setEditingAttributes(false)}
                      aria-label="Annuler"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-white/50 text-sm mt-0.5 flex items-center gap-1.5">
                    {stats.position || "Joueur"}
                    {isCoach && (
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-white/80 hover:text-white"
                        onClick={() => {
                          setPositionInput(profile.position ?? "");
                          setPreferredFootInput(profile.preferred_foot ?? "");
                          setSecondaryPositionsInput(profile.secondary_positions ?? []);
                          setEditingAttributes(true);
                        }}
                        title="Modifier le pied fort et les postes"
                        aria-label="Modifier le pied fort et les postes"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </p>
                  {(profile.preferred_foot || profile.height_cm || profile.weight_kg || (profile.secondary_positions?.length ?? 0) > 0) && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/60">
                      {profile.preferred_foot && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                          <span className="h-2 w-2 rounded-full bg-white/70" />
                          Pied {profile.preferred_foot.toLowerCase()}
                        </span>
                      )}
                      {profile.height_cm && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                          {profile.height_cm} cm
                        </span>
                      )}
                      {profile.weight_kg && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                          {profile.weight_kg} kg
                        </span>
                      )}
                    </p>
                  )}
                  {(profile.secondary_positions?.length ?? 0) > 0 && (
                    <p className="mt-1 text-[11px] text-white/50">
                      Aussi : {profile.secondary_positions!.join(" · ")}
                    </p>
                  )}
                </>
              )}
              <div className="flex gap-2 mt-2">
                {stats.yellow_cards > 0 && <Badge className="bg-yellow-400 text-yellow-900">{stats.yellow_cards} jaunes</Badge>}
                {stats.red_cards > 0 && <Badge className="bg-red-500 text-white">{stats.red_cards} rouges</Badge>}
              </div>
              <button
                onClick={() => setPaniniOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-gold)] px-3 py-1.5 text-xs font-bold text-[var(--color-navy)] transition-opacity hover:opacity-90"
              >
                <IdCard className="h-3.5 w-3.5" />
                Carte joueur
              </button>
            </div>
          </div>
      </div>

      <EmergencyInfoCard
        playerId={playerId}
        allergies={profile.allergies ?? null}
        licenceNumber={profile.licence_number ?? null}
        contacts={profile.emergency_contacts ?? []}
        canEdit={isCoach || playerId === user?.id || isParentOfPlayer}
        onSaved={(allergies, licenceNumber, contacts) =>
          setProfile((prev) =>
            prev ? { ...prev, allergies, licence_number: licenceNumber, emergency_contacts: contacts } : prev
          )
        }
      />

      <DisciplineCard
        playerId={playerId}
        playerName={`${profile.first_name} ${profile.last_name}`}
        teamId={currentTeam.id}
        isCoach={isCoach}
      />

      <MedicalRecordCard
        playerId={playerId}
        playerName={`${profile.first_name} ${profile.last_name}`}
        teamId={currentTeam.id}
        isCoach={isCoach}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg} mx-auto mb-2`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
        {/* VMA Card */}
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100 text-pink-700 mx-auto mb-2">
              <Gauge className="h-5 w-5" />
            </div>
            {editingVma ? (
              <div className="flex items-center gap-1 justify-center">
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="30"
                  value={vmaInput}
                  onChange={(e) => setVmaInput(e.target.value)}
                  className="h-8 w-20 text-center text-sm"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={handleSaveVma}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => { setEditingVma(false); setVmaInput(vma?.toString() ?? ""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold">{vma ? `${vma.toFixed(1)}` : "—"}</p>
                <div className="flex items-center justify-center gap-1">
                  <p className="text-xs text-muted-foreground">VMA</p>
                  {isCoach && (
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingVma(true)}>
                      <Gauge className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {fffCategory && vmaStatus && (
                  <Badge className={`mt-1 text-[10px] border ${NORM_COLORS[vmaStatus]}`}>
                    {NORM_LABELS[vmaStatus]} · {fffCategory}
                  </Badge>
                )}
              </>
            )}
          </CardContent>
        </Card>
        {/* VMI Card */}
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-100 text-cyan-700 mx-auto mb-2">
              <Wind className="h-5 w-5" />
            </div>
            {editingVmi ? (
              <div className="flex items-center gap-1 justify-center">
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="30"
                  value={vmiInput}
                  onChange={(e) => setVmiInput(e.target.value)}
                  className="h-8 w-20 text-center text-sm"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={handleSaveVmi}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => { setEditingVmi(false); setVmiInput(vmi?.toString() ?? ""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold">{vmi ? `${vmi.toFixed(1)}` : "—"}</p>
                <div className="flex items-center justify-center gap-1">
                  <p className="text-xs text-muted-foreground">VMI</p>
                  {isCoach && (
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingVmi(true)}>
                      <Wind className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {fffCategory && vmiStatus && (
                  <Badge className={`mt-1 text-[10px] border ${NORM_COLORS[vmiStatus]}`}>
                    {NORM_LABELS[vmiStatus]} · {fffCategory}
                  </Badge>
                )}
              </>
            )}
          </CardContent>
        </Card>
        {/* MVP Card */}
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-[var(--color-gold)] mx-auto mb-2">
              <Trophy className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold">{mvpCount}</p>
            <p className="text-xs text-muted-foreground">
              Fois joueur du match
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance par saison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[var(--color-royal)]" />
            Performance — Saison {currentSeason}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {matchRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun match enregistré</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {seasonItems.map((item) => {
                const diff = item.prev !== null ? item.cur - item.prev : null;
                return (
                  <div key={item.label} className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{item.cur}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    {diff !== null && diff !== 0 && (
                      <p className={`text-[11px] font-medium mt-0.5 ${diff > 0 ? "text-green-600" : "text-red-600"}`}>
                        {diff > 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
                        {diff > 0 ? "+" : ""}
                        {diff} vs {prevSeason}
                      </p>
                    )}
                    {diff !== null && diff === 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">Égal vs {prevSeason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Objectifs personnels */}
      <PersonalGoalsCard playerId={playerId} />

      {/* Badges & séries */}
      <PlayerBadgesCard playerId={playerId} teamId={currentTeam.id} />

      {/* Historique de carrière */}
      <CareerHistoryCard playerId={playerId} />

      {/* Historique VMA / VMI */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--color-royal)]" />
            Évolution physique (VMA / VMI)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PhysicalEvolutionChart title="VMA" color="#ec4899" tests={vmaTests} />
            <PhysicalEvolutionChart title="VMI" color="#06b6d4" tests={vmiTests} />
          </div>
        </CardContent>
      </Card>

      {/* Progression des notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-[var(--color-royal)]" />
            Progression des notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NotesEvolutionChart points={notesData} />
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" /> Retour du coach
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Notes des joueurs
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Carnet du joueur — notes coach */}
      {currentTeam && (
        <CoachNotesCard playerId={playerId} teamId={currentTeam.id} />
      )}

      {/* Comparaison joueur vs équipe */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--color-royal)]" />
            Comparaison vs moyenne de l&apos;équipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          {radarData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée d&apos;équipe disponible</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} outerRadius="75%">
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, "dataMax"]} tick={false} axisLine={false} />
                <Radar name="Joueur" dataKey="Joueur" stroke="var(--color-royal)" fill="var(--color-royal)" fillOpacity={0.5} />
                <Radar name="Moyenne équipe" dataKey="Moyenne" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Détail par match */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[var(--color-royal)]" />
            Détail par match
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {matchRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun match joué</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Adversaire</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center">Buts</TableHead>
                  <TableHead className="text-center">Passes</TableHead>
                  <TableHead className="text-center">Cartons</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...matchRows].reverse().map((r) => (
                  <TableRow key={r.event_id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.event_date)}</TableCell>
                    <TableCell>{r.opponent || r.title || "—"}</TableCell>
                    <TableCell className="text-center">
                      {r.score_us != null && r.score_them != null ? `${r.score_us}-${r.score_them}` : "—"}
                    </TableCell>
                    <TableCell className="text-center">{r.goals || "—"}</TableCell>
                    <TableCell className="text-center">{r.assists || "—"}</TableCell>
                    <TableCell className="text-center">
                      {r.yellow_cards > 0 || r.red_cards > 0
                        ? `${r.yellow_cards}j${r.red_cards ? ` ${r.red_cards}r` : ""}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">{r.minutes_played || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {currentTeam && (
        <QuarterlyReportsCard playerId={playerId} teamId={currentTeam.id} isCoach={isCoach} />
      )}

      {/* Carnet de match du joueur */}
      <PlayerNotebookCard
        playerId={playerId}
        teamId={currentTeam.id}
        canEdit={playerId === user?.id}
      />

      {currentTeam && (
        <PlayerPaniniCard
          playerId={playerId}
          teamId={currentTeam.id}
          open={paniniOpen}
          onOpenChange={setPaniniOpen}
        />
      )}
    </div>
  );
}
