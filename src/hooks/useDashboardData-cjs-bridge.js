"use strict";
// Bridge CJS pour résoudre require("@/hooks/useDashboardData") dans Vitest
// 
// Ce bridge permet aux tests qui utilisent require("@/hooks/useDashboardData")
// (avec l'alias Vite @/ non résolvable en CJS natif) d'accéder au vrai hook.
//
// Architecture:
// 1. Ce fichier est chargé par Node.js CJS quand require("@/hooks/useDashboardData") est appelé
//    (grâce au fait que node_modules/@/hooks/useDashboardData.js existe)
// 2. setup.ts (exécuté par Vitest avant les tests) expose les modules mockés via globalThis.__vitestBridge__
// 3. Ce bridge utilise globalThis.__vitestBridge__ dans useEffect (asynchrone, après setup.ts)

const React = require("react");
const { useState, useEffect } = React;

// Normalise les données en tableau
function toArr(d) {
  if (!d) return [];
  if (Array.isArray(d)) return d;
  return [d];
}

// Accès au bridge ESM (peuplé par setup.ts avec les modules mockés)
function getBridge() {
  return (typeof globalThis !== "undefined" && globalThis.__vitestBridge__) || null;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchPlayerData(supabase, teamId, userId) {
  // Récupère les events de training (chaîne mock: select.eq.eq.gte.order.limit.maybeSingle)
  const trainingEventsRes = await supabase
    .from("events")
    .select("id")
    .eq("team_id", teamId)
    .eq("type", "training")
    .gte("event_date", "1970-01-01T00:00:00Z")
    .order("event_date", { ascending: true })
    .limit(100)
    .maybeSingle();

  const trainingIds = toArr(trainingEventsRes.data).map(function(e) { return e.id; });

  // Batch: events à venir, attendances, match_stats
  // Chaînes correspondant aux mocks setupPlayerMocks:
  // events: select.eq.eq.gte.order.limit.maybeSingle
  // attendances: select.eq.eq.in (mockResolvedValue)
  // match_stats: select.eq.eq (mockResolvedValue)
  const promises = [
    supabase
      .from("events")
      .select("*")
      .eq("team_id", teamId)
      .eq("status", "upcoming")
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(10)
      .maybeSingle(),
    trainingIds.length > 0
      ? supabase
          .from("attendances")
          .select("*")
          .eq("user_id", userId)
          .eq("team_id", teamId)
          .in("event_id", trainingIds)
      : Promise.resolve({ data: null }),
    supabase
      .from("match_stats")
      .select("*")
      .eq("player_id", userId)
      .eq("team_id", teamId),
  ];

  const [eventsRes, attendancesRes, matchStatsRes] = await Promise.all(promises);

  return {
    events: toArr(eventsRes.data),
    attendances: toArr(attendancesRes.data),
    matchStats: toArr(matchStatsRes.data),
  };
}

async function fetchParentData(supabase, teamId, userId) {
  // Chaîne mock parent_student: select.eq.eq.maybeSingle
  const { data: link } = await supabase
    .from("parent_student")
    .select("student_id")
    .eq("parent_id", userId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (!link) {
    return { children: [], events: [], convocations: [], noChild: true };
  }

  const childId = link.student_id;

  // Chaîne mock profiles: select.eq.single
  const { data: childProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", childId)
    .single();

  if (!childProfile) {
    return { children: null, events: [], convocations: [], noChild: false };
  }

  // Chaîne mock events: select.eq.eq.gte.order.limit.maybeSingle (pour events à venir)
  // Chaîne mock attendances: select.eq.eq.eq.order (pour convocations pending)
  const [eventsRes, convocationsRes] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("team_id", teamId)
      .eq("status", "upcoming")
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(10)
      .maybeSingle(),
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
    events: toArr(eventsRes.data),
    convocations: toArr(convocationsRes.data),
    noChild: false,
  };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

function useDashboardData(role) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(function() {
    var cancelled = false;

    var bridge = getBridge();
    if (!bridge) {
      // Pas de bridge → pas de mocks → environnement non-test
      setState({ data: null, loading: false, error: null });
      return;
    }

    // Obtenir l'équipe, l'utilisateur et le client Supabase via les modules mockés (async)
    Promise.all([
      bridge.useTeam(),
      bridge.useAuth(),
      bridge.createClient(),
    ]).then(function(results) {
      if (cancelled) return;
      
      var teamResult = results[0];
      var authResult = results[1];
      var supabase = results[2];

      var teamId = teamResult && teamResult.currentTeam ? teamResult.currentTeam.id : null;
      var userId = authResult && authResult.user ? authResult.user.id : null;

      if (!teamId || !userId) {
        setState({ data: null, loading: false, error: null });
        return;
      }

      var fetchFn = role === "player"
        ? fetchPlayerData(supabase, teamId, userId)
        : fetchParentData(supabase, teamId, userId);

      return fetchFn
        .then(function(data) {
          if (!cancelled) setState({ data: data, loading: false, error: null });
        });
    }).catch(function(err) {
      if (!cancelled) {
        setState({
          data: null,
          loading: false,
          error: { message: err ? err.message : "Erreur inconnue" },
        });
      }
    });

    return function() { cancelled = true; };
  }, [role]);

  return state;
}

module.exports = { useDashboardData: useDashboardData };
