"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerDashboardData {
  events: unknown[];
  attendances: unknown[];
  matchStats: unknown[];
}

interface ParentDashboardData {
  children: unknown[] | null;
  events: unknown[];
  convocations: unknown[];
  noChild?: boolean;
}

// Le hook retourne une forme différente selon le rôle demandé. On modélise ça
// avec un type générique piloté par le littéral de rôle, ce qui permet à TS de
// narrower correctement `data` au site d'appel (data.convocations n'existe que
// pour role === "parent", data.attendances/matchStats que pour role === "player"),
// sans avoir à répliquer une union stricte que l'appelant devrait re-discriminer.
type DashboardDataFor<R extends "player" | "parent"> = R extends "player"
  ? PlayerDashboardData
  : ParentDashboardData;

interface UseDashboardDataResult<R extends "player" | "parent" = "player" | "parent"> {
  data: DashboardDataFor<R> | null;
  loading: boolean;
  error: { message: string } | null;
}

// ─── Fetchers Player ──────────────────────────────────────────────────────────

async function fetchPlayerData(
  teamId: string,
  userId: string
): Promise<PlayerDashboardData> {
  const supabase = createClient();

  // D'abord récupérer les IDs des événements de formation
  const { data: trainingEvents } = await supabase
    .from("events")
    .select("id")
    .eq("team_id", teamId)
    .eq("type", "training");

  const trainingIds = (trainingEvents || []).map((e: { id: string }) => e.id);

  // Batch : events (à venir), attendances, match_stats
  const [eventsRes, attendancesRes, matchStatsRes] = await Promise.all([
    // Events de la team à venir
    supabase
      .from("events")
      .select("*")
      .eq("team_id", teamId)
      .in("status", ["upcoming", "ongoing"])
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(10),
    // Attendances du joueur
    trainingIds.length > 0
      ? supabase
          .from("attendances")
          .select("*")
          .eq("user_id", userId)
          .eq("team_id", teamId)
          .in("event_id", trainingIds)
      : Promise.resolve({ data: [] }),
    // Match stats du joueur
    supabase
      .from("match_stats")
      .select("*")
      .eq("player_id", userId)
      .eq("team_id", teamId),
  ]);

  return {
    events: (eventsRes.data as unknown[]) || [],
    attendances: (attendancesRes.data as unknown[]) || [],
    matchStats: (matchStatsRes.data as unknown[]) || [],
  };
}

// ─── Fetchers Parent ──────────────────────────────────────────────────────────

async function fetchParentData(
  teamId: string,
  userId: string
): Promise<ParentDashboardData> {
  const supabase = createClient();

  // Étape 1 : trouver le lien parent → enfant
  const { data: link } = await supabase
    .from("parent_student")
    .select("student_id")
    .eq("parent_id", userId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!link) {
    return {
      children: [],
      events: [],
      convocations: [],
      noChild: true,
    };
  }

  const childId = (link as { student_id: string }).student_id;

  // Étape 2 : profil de l'enfant
  const { data: childProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", childId)
    .single();

  if (!childProfile) {
    return {
      children: null,
      events: [],
      convocations: [],
      noChild: false,
    };
  }

  // Étape 3 : batch events + convocations de l'enfant
  const [eventsRes, convocationsRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("team_id", teamId)
      .in("status", ["upcoming", "ongoing"])
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(10),
    supabase
      .from("attendances")
      .select("*, event:events!attendances_event_id_fkey(*)")
      .eq("user_id", childId)
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return {
    children: [childProfile],
    events: (eventsRes.data as unknown[]) || [],
    convocations: (convocationsRes.data as unknown[]) || [],
    noChild: false,
  };
}

// ─── Hook useDashboardData (rôles player / parent) ───────────────────────────

export function useDashboardData<R extends "player" | "parent">(
  role: R
): UseDashboardDataResult<R> {
  const { currentTeam } = useTeam();
  const { user } = useAuth();
  const teamId = currentTeam?.id ?? null;
  const userId = user?.id ?? null;

  const [state, setState] = useState<UseDashboardDataResult<R>>({
    data: null,
    loading: teamId !== null,
    error: null,
  });

  const teamIdRef = useRef(teamId);
  const userIdRef = useRef(userId);

  useEffect(() => {
    teamIdRef.current = teamId;
    userIdRef.current = userId;
  });

  useEffect(() => {
    if (!teamId || !userId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState({ data: null, loading: true, error: null });

    const currentTeamId = teamId;
    const currentUserId = userId;

    const fetcher: Promise<DashboardDataFor<R>> =
      role === "player"
        ? (fetchPlayerData(currentTeamId, currentUserId) as Promise<DashboardDataFor<R>>)
        : (fetchParentData(currentTeamId, currentUserId) as Promise<DashboardDataFor<R>>);

    fetcher
      .then((data) => {
        if (teamIdRef.current !== currentTeamId) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (teamIdRef.current !== currentTeamId) return;
        setState({
          data: null,
          loading: false,
          error: { message: err?.message ?? "Erreur inconnue" },
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, userId, role]);

  return state;
}
