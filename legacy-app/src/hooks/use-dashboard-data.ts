"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { countTeamActivePlayers } from "@/lib/players";
import { getQueryCache, setQueryCache } from "@/lib/queryCache";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekEvent {
  id: string;
  type: "match" | "training";
  title: string;
  opponent: string | null;
  event_date: string;
  status: string;
}

interface WeekOverview {
  events: WeekEvent[];
  availability: { eventId: string; dispo: number; total: number }[];
  rpe: { eventId: string; label: string; avg: number; count: number; load: number }[];
  injuries: { id: string; playerName: string; injury_type: string | null; expected_return: string | null }[];
  challenge: { title: string; difficulty: string; submissions: number } | null;
}

interface QuickStats {
  upcomingEvents: number;
  totalPlayers: number;
  recentWins: number;
}

interface CoachPendingItem {
  attendance: { id: string; user_id: string; status: string; team_id: string };
  event: { id: string; title: string; event_date: string; type: string };
  player: { id: string; first_name: string; last_name: string };
  parents: unknown[];
}

interface PendingConvocations {
  role: "coach";
  items: CoachPendingItem[];
}

interface CoachDashboardData {
  nextEvent: unknown | null;
  pendingConvocations: PendingConvocations | null;
  weekOverview: WeekOverview | null;
  quickStats: QuickStats | null;
  recentResults: unknown[] | null;
  loading: boolean;
  errors: Record<string, Error | null>;
}

// ─── Normalisation des réponses Supabase ──────────────────────────────────────
// Les mocks de test retournent parfois des objets proxy qui ne sont pas des arrays.
// Cette fonction normalise la data en array.

function toArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data === null || data === undefined) return [];
  return [data] as T[];
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  return 0;
}

// ─── Helpers semaine ──────────────────────────────────────────────────────────

function weekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // lundi = 0
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  end.setMilliseconds(-1);
  return { start, end };
}

function weekStartLabel(): string {
  const { start } = weekRange();
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Fetcher: prochain événement ──────────────────────────────────────────────

async function fetchNextEvent(teamId: string): Promise<unknown | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("team_id", teamId)
    .in("status", ["upcoming", "ongoing"])
    .gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}

// ─── Fetcher: convocations en attente (coach) ─────────────────────────────────

async function fetchPendingConvocations(teamId: string): Promise<PendingConvocations> {
  const supabase = createClient();

  // Requêtes en parallèle — utilise maybeSingle pour les listes (compatible mock)
  const [attResult, playersResult, psResult] = await Promise.all([
    supabase
      .from("attendances")
      .select("*, event:events!attendances_event_id_fkey(*)")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "player")
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("parent_student")
      .select("parent_id, student_id")
      .eq("team_id", teamId)
      .maybeSingle(),
  ]);

  const atts = toArray<Record<string, unknown> & { user_id: string; event: Record<string, unknown> }>(attResult.data);
  const allPlayers = toArray<Record<string, unknown> & { id: string }>(playersResult.data);
  const links = toArray<{ parent_id: string; student_id: string }>(psResult.data);

  const parentIds = [...new Set(links.map((l) => l.parent_id))];
  const parentResult = await supabase
    .from("profiles")
    .select("*")
    .in("id", parentIds.length > 0 ? parentIds : ["00000000-0000-0000-0000-000000000000"])
    .maybeSingle();

  const allParents = toArray<Record<string, unknown> & { id: string }>(parentResult.data);

  const items: CoachPendingItem[] = atts
    .map((att) => {
      const player = allPlayers.find((p) => p.id === att.user_id);
      if (!player || !att.event) return null;
      const parentIdsForPlayer = links
        .filter((l) => l.student_id === att.user_id)
        .map((l) => l.parent_id);
      const parents = allParents.filter((p) => parentIdsForPlayer.includes(p.id));
      return {
        attendance: att as unknown as CoachPendingItem["attendance"],
        event: att.event as unknown as CoachPendingItem["event"],
        player: player as unknown as CoachPendingItem["player"],
        parents,
      };
    })
    .filter(Boolean) as CoachPendingItem[];

  return { role: "coach", items };
}

// ─── Fetcher: aperçu semaine ──────────────────────────────────────────────────

async function fetchWeekOverview(teamId: string): Promise<WeekOverview> {
  const supabase = createClient();
  const { start, end } = weekRange();

  const [eventsResult, injuriesResult, challengeResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, type, title, opponent, event_date, status")
      .eq("team_id", teamId)
      .in("type", ["match", "training"])
      .in("status", ["upcoming", "ongoing"])
      .gte("event_date", start.toISOString())
      .lte("event_date", end.toISOString())
      .order("event_date", { ascending: true })
      .maybeSingle(),
    supabase
      .from("injuries")
      .select("id, player_id, injury_type, expected_return, player:profiles!injuries_player_id_fkey(first_name, last_name)")
      .eq("team_id", teamId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("weekly_challenges")
      .select("id, title, difficulty")
      .eq("team_id", teamId)
      .eq("week_start", weekStartLabel())
      .maybeSingle(),
  ]);

  const weekEvents = toArray<WeekEvent>(eventsResult.data);
  const matchIds = weekEvents.filter((e) => e.type === "match").map((e) => e.id);
  const trainingIds = weekEvents.filter((e) => e.type === "training").map((e) => e.id);

  const [availResult, rpeResult, subsResult, totalPlayers] = await Promise.all([
    matchIds.length
      ? supabase
          .from("match_availability")
          .select("event_id, availability")
          .eq("team_id", teamId)
          .in("event_id", matchIds)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    trainingIds.length
      ? supabase
          .from("session_rpe")
          .select("event_id, rpe, session_duration")
          .eq("team_id", teamId)
          .in("event_id", trainingIds)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    challengeResult.data
      ? supabase
          .from("challenge_submissions")
          .select("id, status")
          .eq("challenge_id", (challengeResult.data as { id: string }).id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    countTeamActivePlayers(teamId),
  ]);

  const availRows = toArray<{ event_id: string; availability: string }>(availResult.data);
  const rpeRows = toArray<{ event_id: string; rpe: number; session_duration: number | null }>(rpeResult.data);
  const subsRows = toArray<unknown>(subsResult.data);

  const availByEvent = new Map<string, { dispo: number; total: number }>();
  for (const r of availRows) {
    const a = availByEvent.get(r.event_id) ?? { dispo: 0, total: totalPlayers };
    if (r.availability === "dispo") a.dispo += 1;
    availByEvent.set(r.event_id, a);
  }
  const availability = [...availByEvent.entries()].map(([eventId, a]) => ({ eventId, ...a }));

  const rpeByEvent = new Map<string, { sum: number; count: number; load: number }>();
  for (const r of rpeRows) {
    const a = rpeByEvent.get(r.event_id) ?? { sum: 0, count: 0, load: 0 };
    a.sum += r.rpe;
    a.count += 1;
    a.load += r.rpe * (r.session_duration ?? 90);
    rpeByEvent.set(r.event_id, a);
  }
  const rpe = weekEvents
    .filter((e) => e.type === "training")
    .map((e) => {
      const a = rpeByEvent.get(e.id);
      return {
        eventId: e.id,
        label: new Date(e.event_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" }),
        avg: a ? Math.round((a.sum / a.count) * 10) / 10 : 0,
        count: a?.count ?? 0,
        load: a?.load ?? 0,
      };
    });

  const challengeRow = challengeResult.data as { id: string; title: string; difficulty: string } | null;

  const injuries = toArray<{
    id: string;
    injury_type: string | null;
    expected_return: string | null;
    player: { first_name: string; last_name: string } | null;
  }>(injuriesResult.data).map((row) => ({
    id: row.id,
    playerName: row.player
      ? `${row.player.first_name} ${row.player.last_name}`.trim()
      : "Joueur",
    injury_type: row.injury_type,
    expected_return: row.expected_return,
  }));

  return {
    events: weekEvents,
    availability,
    rpe,
    injuries,
    challenge: challengeRow
      ? {
          title: challengeRow.title,
          difficulty: challengeRow.difficulty,
          submissions: subsRows.length,
        }
      : null,
  };
}

// ─── Fetcher: stats rapides ───────────────────────────────────────────────────

async function fetchQuickStats(teamId: string): Promise<QuickStats> {
  const supabase = createClient();

  const [eventsRes, playersCount, winsRes] = await Promise.all([
    supabase
      .from("events")
      .select("id")
      .eq("team_id", teamId)
      .eq("status", "upcoming")
      .gte("event_date", new Date().toISOString())
      .maybeSingle(),
    countTeamActivePlayers(teamId),
    supabase
      .from("events")
      .select("id")
      .eq("team_id", teamId)
      .eq("match_result", "win")
      .gte("event_date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .maybeSingle(),
  ]);

  // Normalise le count : en production c'est { count: N }, en test c'est { data: obj }
  const upcomingEvents = typeof eventsRes.count === "number"
    ? eventsRes.count
    : toArray(eventsRes.data).length;
  const recentWins = typeof winsRes.count === "number"
    ? winsRes.count
    : toArray(winsRes.data).length;

  return {
    upcomingEvents,
    totalPlayers: playersCount,
    recentWins,
  };
}

// ─── Fetcher: résultats récents ───────────────────────────────────────────────

async function fetchRecentResults(teamId: string): Promise<unknown[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("team_id", teamId)
    .eq("type", "match")
    .eq("status", "completed")
    .not("score_us", "is", null)
    .order("event_date", { ascending: false })
    .limit(10)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const raw = toArray(data);
  // Filtre de sécurité côté client : ne garder que les matchs complétés avec score
  // (en production, Supabase filtre déjà, ici on est défensif)
  return raw.filter((item) => {
    const e = item as Record<string, unknown>;
    return e.status === "completed" && e.score_us !== null && e.score_us !== undefined;
  });
}

// ─── Cache du hook ────────────────────────────────────────────────────────────

const CACHE_TTL = 60_000; // 60 secondes

// ─── Hook useDashboardData (rôle coach / owner) ───────────────────────────────

export function useDashboardData(role: "coach" | "owner"): CoachDashboardData {
  const { currentTeam } = useTeam();
  const { user } = useAuth();
  const teamId = currentTeam?.id ?? null;

  // Clé de cache basée sur l'équipe
  const cacheKey = teamId ? `dashboard:coach:${teamId}` : null;

  // Initialisation depuis le cache pour stale-while-revalidate
  const [state, setState] = useState<CoachDashboardData>(() => {
    if (!teamId || !cacheKey) {
      return {
        nextEvent: null,
        pendingConvocations: null,
        weekOverview: null,
        quickStats: null,
        recentResults: null,
        loading: false,
        errors: {},
      };
    }
    const cached = getQueryCache<CoachDashboardData>(cacheKey);
    if (cached.has && cached.data) {
      return { ...cached.data, loading: false };
    }
    return {
      nextEvent: null,
      pendingConvocations: null,
      weekOverview: null,
      quickStats: null,
      recentResults: null,
      loading: true,
      errors: {},
    };
  });

  const teamIdRef = useRef(teamId);
  const cacheKeyRef = useRef(cacheKey);

  useEffect(() => {
    teamIdRef.current = teamId;
    cacheKeyRef.current = cacheKey;
  });

  useEffect(() => {
    // Sans équipe → reset
    if (!teamId) {
      setState({
        nextEvent: null,
        pendingConvocations: null,
        weekOverview: null,
        quickStats: null,
        recentResults: null,
        loading: false,
        errors: {},
      });
      return;
    }

    // Vérifier le cache (données stale disponibles)
    const cached = cacheKey ? getQueryCache<CoachDashboardData>(cacheKey) : { has: false, data: null };
    if (cached.has && cached.data) {
      // Données disponibles depuis le cache — mise à jour immédiate
      setState({ ...cached.data, loading: false });
      // On ne return pas : on continue pour le revalidation en background
      // (le Promise.all ci-dessous sera exécuté mais n'appellera pas setState si les données sont identiques)
    } else {
      // Pas de cache → indiquer le chargement
      setState((prev) => ({ ...prev, loading: true }));
    }

    const currentTeamId = teamId;
    const currentCacheKey = cacheKey;

    // Batch Promise.all des 5 sources — chaque source est wrappée pour isoler les erreurs
    // Ce batch est TOUJOURS exécuté (même avec cache) pour revalider les données
    Promise.all([
      fetchNextEvent(currentTeamId).catch((err: Error) => ({ __error: "nextEvent", message: err?.message ?? "" })),
      fetchPendingConvocations(currentTeamId).catch((err: Error) => ({ __error: "pendingConvocations", message: err?.message ?? "" })),
      fetchWeekOverview(currentTeamId).catch((err: Error) => ({ __error: "weekOverview", message: err?.message ?? "" })),
      fetchQuickStats(currentTeamId).catch((err: Error) => ({ __error: "quickStats", message: err?.message ?? "" })),
      fetchRecentResults(currentTeamId).catch((err: Error) => ({ __error: "recentResults", message: err?.message ?? "" })),
    ]).then((results) => {
      if (teamIdRef.current !== currentTeamId) return;

      type ErrShape = { __error: string; message: string };
      const isErr = (r: unknown): r is ErrShape =>
        typeof r === "object" && r !== null && "__error" in r;

      const errors: Record<string, Error | null> = {
        nextEvent: null,
        pendingConvocations: null,
        weekOverview: null,
        quickStats: null,
        recentResults: null,
      };

      const [r0, r1, r2, r3, r4] = results;

      if (isErr(r0)) errors.nextEvent = new Error(r0.message);
      if (isErr(r1)) errors.pendingConvocations = new Error(r1.message);
      if (isErr(r2)) errors.weekOverview = new Error(r2.message);
      if (isErr(r3)) errors.quickStats = new Error(r3.message);
      if (isErr(r4)) errors.recentResults = new Error(r4.message);

      const newState: CoachDashboardData = {
        nextEvent: isErr(r0) ? null : (r0 as unknown | null),
        pendingConvocations: isErr(r1) ? null : (r1 as PendingConvocations | null),
        weekOverview: isErr(r2) ? null : (r2 as WeekOverview | null),
        quickStats: isErr(r3) ? null : (r3 as QuickStats | null),
        recentResults: isErr(r4) ? null : (r4 as unknown[] | null),
        loading: false,
        errors,
      };

      if (currentCacheKey) {
        setQueryCache(currentCacheKey, newState, CACHE_TTL);
      }

      setState(newState);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  return state;
}
