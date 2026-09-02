"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  Ambulance,
  ArrowLeftRight,
  Check,
  CircleX,
  Flag,
  Goal,
  Loader2,
  Pause,
  Play,
  Radio,
  RotateCw,
  Square,
  Timer,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { EventStatus, MatchEventRecord, Profile } from "@/types";
import { computeMinutesPlayed, type Substitution } from "@/lib/stats/computeMinutesPlayed";

export type LiveEventType =
  | "goal"
  | "opponent_goal"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "injury";

export interface LiveMatchPatch {
  score_us?: number | null;
  score_them?: number | null;
  match_started_at?: string | null;
  match_ended_at?: string | null;
  match_halftime_at?: string | null;
  match_resumed_at?: string | null;
  match_result?: "win" | "loss" | "draw" | null;
  status?: EventStatus;
}

interface LiveMatchTrackerProps {
  eventId: string;
  teamId: string;
  players: Profile[];
  canEdit: boolean;
  isCoach: boolean;
  userId?: string | null;
  eventTitle?: string;
  startedAt: string | null;
  endedAt: string | null;
  halftimeAt: string | null;
  resumedAt: string | null;
  onMatchUpdate: (patch: LiveMatchPatch) => void;
  onStatsChange: () => void;
  /** Durée d'une mi-temps en minutes. Défaut : 45 */
  halfDuration?: number;
}

interface EventTypeConfig {
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  iconClass: string;
  badgeClass: string;
}

const EVENT_TYPE_CONFIG: Record<LiveEventType, EventTypeConfig> = {
  goal: {
    label: "But",
    shortLabel: "But",
    icon: Goal,
    iconClass: "text-green-600",
    badgeClass: "bg-green-100 text-green-700 border-green-200",
  },
  opponent_goal: {
    label: "But adverse",
    shortLabel: "But adv.",
    icon: Goal,
    iconClass: "text-red-600",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
  },
  yellow_card: {
    label: "Carton jaune",
    shortLabel: "Jaune",
    icon: Square,
    iconClass: "text-yellow-500",
    badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200",
  },
  red_card: {
    label: "Carton rouge",
    shortLabel: "Rouge",
    icon: Square,
    iconClass: "text-red-600",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
  },
  substitution: {
    label: "Changement",
    shortLabel: "Chgt",
    icon: ArrowLeftRight,
    iconClass: "text-[var(--color-royal)]",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
  },
  injury: {
    label: "Blessure",
    shortLabel: "Blessure",
    icon: Ambulance,
    iconClass: "text-orange-600",
    badgeClass: "bg-orange-100 text-orange-700 border-orange-200",
  },
};

const EVENT_ORDER: LiveEventType[] = [
  "goal",
  "opponent_goal",
  "yellow_card",
  "red_card",
  "substitution",
  "injury",
];

function sortedPlayers(players: Profile[]) {
  return [...players].sort(
    (a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999)
  );
}

function playerName(p: Profile | undefined) {
  if (!p) return null;
  const num = p.shirt_number ? ` #${p.shirt_number}` : "";
  return `${p.first_name} ${p.last_name}${num}`;
}

function eventSummary(ev: MatchEventRecord, players: Profile[]) {
  const main = playerName(players.find((p) => p.id === ev.player_id));
  const related = playerName(players.find((p) => p.id === ev.related_player_id));

  switch (ev.event_type) {
    case "goal":
      return {
        text: main
          ? `But de ${main}${related ? ` — passe de ${related}` : ""}`
          : `But${related ? ` — passe de ${related}` : ""}`,
        detail: ev.notes || null,
      };
    case "opponent_goal":
      return {
        text: "But de l'équipe adverse",
        detail: ev.notes || null,
      };
    case "yellow_card":
      return { text: main ? `Carton jaune pour ${main}` : "Carton jaune", detail: ev.notes || null };
    case "red_card":
      return { text: main ? `Carton rouge pour ${main}` : "Carton rouge", detail: ev.notes || null };
    case "substitution":
      return {
        text: main && related ? `Sortie de ${main} — entrée de ${related}` : "Changement",
        detail: ev.notes || null,
      };
    case "injury":
      return {
        text: main ? `Blessure de ${main}` : "Blessure",
        detail: ev.notes || null,
      };
    default:
      return { text: ev.event_type, detail: ev.notes || null };
  }
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function LiveMatchTracker({
  eventId,
  teamId,
  players,
  canEdit,
  isCoach,
  userId,
  eventTitle,
  startedAt,
  endedAt,
  halftimeAt,
  resumedAt,
  onMatchUpdate,
  onStatsChange,
  halfDuration = 45,
}: LiveMatchTrackerProps) {
  const [events, setEvents] = useState<MatchEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogType, setDialogType] = useState<LiveEventType | null>(null);
  const [minute, setMinute] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busyLive, setBusyLive] = useState(false);

  const onMatchUpdateRef = useRef(onMatchUpdate);
  useEffect(() => {
    onMatchUpdateRef.current = onMatchUpdate;
  }, [onMatchUpdate]);
  const onStatsChangeRef = useRef(onStatsChange);
  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  const playerList = useMemo(() => sortedPlayers(players), [players]);

  const startMs = startedAt ? new Date(startedAt).getTime() : null;
  const halftimeMs = halftimeAt ? new Date(halftimeAt).getTime() : null;
  const resumedMs = resumedAt ? new Date(resumedAt).getTime() : null;
  const endMs = endedAt ? new Date(endedAt).getTime() : null;
  const phase: "pre" | "playing" | "halftime" | "ended" =
    !startedAt
      ? "pre"
      : endedAt
        ? "ended"
        : halftimeAt && !resumedAt
          ? "halftime"
          : "playing";

  const HALF_MS = halfDuration * 60000;
  const FULL_MS = halfDuration * 2 * 60000;
  const clockRef = endMs ?? now;
  let elapsedMs = 0;
  if (startMs !== null) {
    if (phase === "ended") {
      elapsedMs = FULL_MS;
    } else if (phase === "halftime") {
      elapsedMs = HALF_MS;
    } else if (halftimeMs !== null && resumedMs !== null) {
      elapsedMs = HALF_MS + Math.max(0, clockRef - resumedMs);
      elapsedMs = Math.min(elapsedMs, FULL_MS);
    } else {
      elapsedMs = Math.min(Math.max(0, clockRef - startMs), HALF_MS);
    }
  }
  const currentMinute = Math.floor(elapsedMs / 60000);

  const fetchEvents = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("match_events")
      .select("*")
      .eq("event_id", eventId)
      .eq("team_id", teamId)
      .order("minute", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setEvents((data as MatchEventRecord[]) || []);
    setLoading(false);
  }, [eventId, teamId]);

  const refreshMatch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("events")
      .select("score_us, score_them, match_started_at, match_ended_at, match_halftime_at, match_resumed_at, match_result, status")
      .eq("id", eventId)
      .maybeSingle();
    if (!data) return;
    setNow(Date.now());
    onMatchUpdateRef.current({
      score_us: data.score_us as number | null,
      score_them: data.score_them as number | null,
      match_started_at: data.match_started_at as string | null,
      match_ended_at: data.match_ended_at as string | null,
      match_halftime_at: data.match_halftime_at as string | null,
      match_resumed_at: data.match_resumed_at as string | null,
      match_result: data.match_result as LiveMatchPatch["match_result"],
      status: data.status as EventStatus,
    });
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("match_events")
        .select("*")
        .eq("event_id", eventId)
        .eq("team_id", teamId)
        .order("minute", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setEvents((data as MatchEventRecord[]) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, teamId]);

  useEffect(() => {
    const supabase = createClient();
    const eventsCh = supabase
      .channel(`live_match_events_${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_events",
          filter: `event_id=eq.${eventId}`,
        },
        () => fetchEvents()
      )
      .subscribe();
    const matchCh = supabase
      .channel(`live_match_status_${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `id=eq.${eventId}`,
        },
        () => refreshMatch()
      )
      .subscribe();
    const statsCh = supabase
      .channel(`live_match_stats_${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_stats",
          filter: `event_id=eq.${eventId}`,
        },
        () => onStatsChangeRef.current()
      )
      .subscribe();
    const pollEvents = setInterval(fetchEvents, 20000);
    const pollMatch = setInterval(refreshMatch, 20000);
    const pollStats = setInterval(() => onStatsChangeRef.current(), 20000);
    return () => {
      supabase.removeChannel(eventsCh);
      supabase.removeChannel(matchCh);
      supabase.removeChannel(statsCh);
      clearInterval(pollEvents);
      clearInterval(pollMatch);
      clearInterval(pollStats);
    };
  }, [eventId, fetchEvents, refreshMatch]);

  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  async function syncScore() {
    const supabase = createClient();
    const { data } = await supabase
      .from("match_events")
      .select("event_type")
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    const rows = (data || []) as { event_type: string }[];
    const us = rows.filter((r) => r.event_type === "goal").length;
    const them = rows.filter((r) => r.event_type === "opponent_goal").length;
    const { error } = await supabase
      .from("events")
      .update({ score_us: us, score_them: them })
      .eq("id", eventId);
    if (!error) {
      onMatchUpdateRef.current({ score_us: us, score_them: them });
    }
  }

  async function notifyLive(title: string, body?: string) {
    try {
      if (players.length === 0) return;
      const supabase = createClient();
      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", teamId)
        .in("student_id", players.map((p) => p.id));
      const parentIds = [
        ...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id)),
      ];
      const userIds = [...new Set([...players.map((p) => p.id), ...parentIds])];
      if (userIds.length === 0) return;
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: userIds,
          title,
          body: body || eventTitle || "Match en direct",
          type: "match_live",
          reference_id: eventId,
          team_id: teamId,
          url: `/matches/${eventId}`,
        }),
      });
    } catch (err) {
      console.error("[live-match] notify error:", err);
    }
  }

  function notifyLiveEvent(
    eventType: LiveEventType,
    playerId: string | null,
    minute: number | null
  ) {
    if (!["goal", "opponent_goal", "yellow_card", "red_card", "injury"].includes(eventType)) {
      return;
    }
    const p = playerList.find((pl) => pl.id === playerId);
    const name = playerName(p);
    const minStr = minute !== null ? ` (${minute}')` : "";
    let title = "";
    switch (eventType) {
      case "goal": {
        const us = events.filter((e) => e.event_type === "goal").length + 1;
        const them = events.filter((e) => e.event_type === "opponent_goal").length;
        title = `⚽ But de ${name || "notre équipe"}${minStr} — ${us}-${them}`;
        break;
      }
      case "opponent_goal": {
        const us = events.filter((e) => e.event_type === "goal").length;
        const them = events.filter((e) => e.event_type === "opponent_goal").length + 1;
        title = `But de l'adversaire${minStr} — ${us}-${them}`;
        break;
      }
      case "yellow_card":
        title = `Carton jaune pour ${name || "un joueur"}${minStr}`;
        break;
      case "red_card":
        title = `Carton rouge pour ${name || "un joueur"}${minStr}`;
        break;
      case "injury":
        title = `Blessure de ${name || "un joueur"}${minStr}`;
        break;
    }
    if (title) notifyLive(title);
  }

  async function syncStats(endedAtOverride?: string | null) {
    const supabase = createClient();
    const { data } = await supabase
      .from("match_events")
      .select("event_type, player_id, related_player_id, minute")
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    const rows = (data || []) as {
      event_type: string;
      player_id: string | null;
      related_player_id: string | null;
      minute: number | null;
    }[];

    const counters = new Map<
      string,
      { goals: number; assists: number; yellow_cards: number; red_cards: number }
    >();
    const bump = (id: string | null, key: "goals" | "assists" | "yellow_cards" | "red_cards") => {
      if (!id) return;
      const c = counters.get(id) || { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 };
      c[key] += 1;
      counters.set(id, c);
    };
    for (const r of rows) {
      if (r.event_type === "goal") {
        bump(r.player_id, "goals");
        bump(r.related_player_id, "assists");
      } else if (r.event_type === "yellow_card") {
        bump(r.player_id, "yellow_cards");
      } else if (r.event_type === "red_card") {
        bump(r.player_id, "red_cards");
      }
    }

    // Calcul des minutes jouées via le helper
    const subs: Substitution[] = rows
      .filter(
        (r) =>
          r.event_type === "substitution" &&
          r.player_id &&
          r.related_player_id
      )
      .map((r) => ({
        minute: r.minute ?? 0,
        playerOut: r.player_id!,
        playerIn: r.related_player_id!,
      }));
    const subInIds = new Set(subs.map((s) => s.playerIn));
    const starterIds = players.map((p) => p.id).filter((id) => !subInIds.has(id));
    const effectiveEndedAt = endedAtOverride !== undefined ? endedAtOverride : endedAt;
    const minutesMap = computeMinutesPlayed(
      startedAt,
      effectiveEndedAt,
      subs,
      starterIds,
      undefined,
      halftimeAt,
      resumedAt
    );

    const { data: existingRows } = await supabase
      .from("match_stats")
      .select("id, player_id, minutes_played")
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    const existingMap = new Map(
      (existingRows || []).map((e) => [
        e.player_id as string,
        e as { id: string; minutes_played: number },
      ])
    );

    for (const [playerId, c] of counters) {
      const ex = existingMap.get(playerId);
      const minutes = minutesMap.get(playerId) ?? ex?.minutes_played ?? 0;
      const hasData =
        c.goals > 0 || c.assists > 0 || c.yellow_cards > 0 || c.red_cards > 0 || minutes > 0;
      if (ex) {
        if (hasData) {
          await supabase
            .from("match_stats")
            .update({
              goals: c.goals,
              assists: c.assists,
              yellow_cards: c.yellow_cards,
              red_cards: c.red_cards,
              minutes_played: minutes,
            })
            .eq("id", ex.id);
        } else {
          await supabase.from("match_stats").delete().eq("id", ex.id);
        }
      } else if (hasData) {
        await supabase.from("match_stats").insert({
          event_id: eventId,
          player_id: playerId,
          team_id: teamId,
          goals: c.goals,
          assists: c.assists,
          yellow_cards: c.yellow_cards,
          red_cards: c.red_cards,
          minutes_played: minutes,
        });
      }
    }

    // Joueurs avec des minutes calculées mais sans events dans counters
    // (ex : remplaçants sans but ni carton, titulaires sans events)
    for (const [playerId, mins] of minutesMap) {
      if (counters.has(playerId)) continue; // déjà traité ci-dessus
      if (mins <= 0) continue;
      const ex = existingMap.get(playerId);
      if (ex) {
        await supabase
          .from("match_stats")
          .update({ minutes_played: mins })
          .eq("id", ex.id);
      } else {
        await supabase.from("match_stats").insert({
          event_id: eventId,
          player_id: playerId,
          team_id: teamId,
          goals: 0,
          assists: 0,
          yellow_cards: 0,
          red_cards: 0,
          minutes_played: mins,
        });
      }
    }

    const orphaned = Array.from(existingMap.keys()).filter(
      (pid) => !counters.has(pid) && !minutesMap.has(pid)
    );
    for (const playerId of orphaned) {
      const ex = existingMap.get(playerId);
      if (!ex) continue;
      const hasData = (ex.minutes_played ?? 0) > 0;
      if (hasData) {
        await supabase
          .from("match_stats")
          .update({ goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 })
          .eq("id", ex.id);
      } else {
        await supabase.from("match_stats").delete().eq("id", ex.id);
      }
    }

    onStatsChangeRef.current();
  }

  async function handleAdd(eventType: LiveEventType) {
    const supabase = createClient();
    const form = document.getElementById("live-event-form") as HTMLFormElement | null;
    if (!form) return;
    const fd = new FormData(form);

    const minuteRaw = fd.get("minute")?.toString().trim() || "";
    const minute = minuteRaw === "" ? null : parseInt(minuteRaw, 10);
    const playerId = fd.get("player_id")?.toString() || null;
    const relatedPlayerId = fd.get("related_player_id")?.toString() || null;
    const notes = fd.get("notes")?.toString().trim() || null;

    if (minute !== null && (Number.isNaN(minute) || minute < 0 || minute > 120)) {
      toast.error("La minute doit être comprise entre 0 et 120");
      return;
    }

    if (["goal", "yellow_card", "red_card", "injury"].includes(eventType) && !playerId) {
      toast.error("Sélectionnez un joueur");
      return;
    }
    if (eventType === "substitution" && (!playerId || !relatedPlayerId)) {
      toast.error("Sélectionnez le joueur sortant et le joueur entrant");
      return;
    }
    if (eventType === "substitution" && playerId === relatedPlayerId) {
      toast.error("Le joueur entrant doit être différent du sortant");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("match_events").insert({
      event_id: eventId,
      team_id: teamId,
      event_type: eventType,
      player_id: playerId,
      related_player_id: relatedPlayerId || null,
      minute,
      notes,
      created_by: userId || null,
    });
    setSaving(false);

    if (error) {
      toast.error(`Erreur lors de l'ajout : ${error.message}`);
      return;
    }

    toast.success(`${EVENT_TYPE_CONFIG[eventType].label} ajouté`);
    setDialogType(null);
    fetchEvents();
    if (eventType === "goal" || eventType === "opponent_goal") {
      syncScore();
    }
    if (["goal", "yellow_card", "red_card", "substitution"].includes(eventType)) {
      syncStats();
    }
    notifyLiveEvent(eventType, playerId, minute);
  }

  async function handleDelete(id: string, eventType: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("match_events")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    toast.success("Événement supprimé");
    fetchEvents();
    if (eventType === "goal" || eventType === "opponent_goal") {
      syncScore();
    }
    if (["goal", "yellow_card", "red_card", "substitution"].includes(eventType)) {
      syncStats();
    }
  }

  async function startMatch() {
    const supabase = createClient();
    setBusyLive(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("events")
      .update({
        match_started_at: nowIso,
        match_halftime_at: null,
        match_resumed_at: null,
        match_ended_at: null,
        status: "ongoing",
      })
      .eq("id", eventId);
    setBusyLive(false);
    if (error) {
      toast.error("Erreur lors du démarrage");
      return;
    }
    setNow(Date.now());
    toast.success("Début du match");
    onMatchUpdateRef.current({
      match_started_at: nowIso,
      match_halftime_at: null,
      match_resumed_at: null,
      match_ended_at: null,
      status: "ongoing",
    });
    notifyLive("Début du match");
  }

  async function halfTime() {
    const supabase = createClient();
    setBusyLive(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("events")
      .update({ match_halftime_at: nowIso })
      .eq("id", eventId);
    setBusyLive(false);
    if (error) {
      toast.error("Erreur lors de la mi-temps");
      return;
    }
    toast.success("Mi-temps");
    onMatchUpdateRef.current({ match_halftime_at: nowIso });
    notifyLive("Mi-temps");
  }

  async function resumeMatch() {
    const supabase = createClient();
    setBusyLive(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("events")
      .update({ match_resumed_at: nowIso })
      .eq("id", eventId);
    setBusyLive(false);
    if (error) {
      toast.error("Erreur lors de la reprise");
      return;
    }
    setNow(Date.now());
    toast.success("Début de la 2e mi-temps");
    onMatchUpdateRef.current({ match_resumed_at: nowIso });
    notifyLive("Début de la 2e mi-temps");
  }

  async function endMatch() {
    const supabase = createClient();
    setBusyLive(true);
    const nowIso = new Date().toISOString();
    const { data: ev } = await supabase
      .from("events")
      .select("score_us, score_them")
      .eq("id", eventId)
      .maybeSingle();
    let result: LiveMatchPatch["match_result"] = null;
    if (ev && ev.score_us !== null && ev.score_them !== null) {
      result = ev.score_us > ev.score_them ? "win" : ev.score_us < ev.score_them ? "loss" : "draw";
    }
    const { error } = await supabase
      .from("events")
      .update({ match_ended_at: nowIso, status: "completed", match_result: result })
      .eq("id", eventId);
    setBusyLive(false);
    if (error) {
      toast.error("Erreur lors de la fin du match");
      return;
    }
    toast.success("Match terminé");
    onMatchUpdateRef.current({
      match_ended_at: nowIso,
      status: "completed",
      match_result: result,
    });
    // Synchroniser les stats finales (minutes jouées) avec match_ended_at connu
    syncStats(nowIso);
    const scoreStr =
      ev && ev.score_us !== null && ev.score_them !== null
        ? ` : ${ev.score_us}-${ev.score_them}`
        : "";
    notifyLive(`Match terminé${scoreStr}`);
  }

  async function reopenMatch() {
    const supabase = createClient();
    setBusyLive(true);
    const { error } = await supabase
      .from("events")
      .update({ match_ended_at: null, status: "ongoing" })
      .eq("id", eventId);
    setBusyLive(false);
    if (error) {
      toast.error("Erreur lors de la réouverture");
      return;
    }
    toast.success("Match relancé");
    onMatchUpdateRef.current({ match_ended_at: null, status: "ongoing" });
  }

  function pickerLabel(type: "sortie" | "entrée" | "buteur" | "passeur" | "joueur") {
    switch (type) {
      case "sortie":
        return "Joueur sortant";
      case "entrée":
        return "Joueur entrant";
      case "buteur":
        return "Buteur";
      case "passeur":
        return "Passeur décisif (facultatif)";
      default:
        return "Joueur";
    }
  }

  function openDialog(type: LiveEventType) {
    setMinute(startMs !== null ? String(currentMinute) : "");
    setDialogType(type);
  }

  function renderPlayerSelect(
    name: string,
    label: string,
    allowEmpty: boolean,
    emptyLabel = "Aucun"
  ) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{label}</Label>
        <select
          name={name}
          defaultValue=""
          className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {allowEmpty && <option value="">{emptyLabel}</option>}
          {!allowEmpty && <option value="">Choisir un joueur</option>}
          {playerList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name}
              {p.shirt_number ? ` (#${p.shirt_number})` : ""}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const dialogFields = dialogType && (
    <form id="live-event-form" className="space-y-4">
      {dialogType === "goal" && (
        <>
          {renderPlayerSelect("player_id", "Buteur", false)}
          {renderPlayerSelect("related_player_id", "Passeur décisif (facultatif)", true, "Sans passeur")}
        </>
      )}
      {dialogType === "opponent_goal" && (
        <p className="text-sm text-muted-foreground rounded-lg bg-muted/50 px-3 py-2">
          Un but pour l&apos;équipe adverse.
        </p>
      )}
      {["yellow_card", "red_card", "injury"].includes(dialogType) &&
        renderPlayerSelect("player_id", pickerLabel("joueur"), false)}
      {dialogType === "substitution" && (
        <>
          {renderPlayerSelect("player_id", "Joueur sortant", false)}
          {renderPlayerSelect("related_player_id", "Joueur entrant", false)}
        </>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Minute</Label>
        <Input
          name="minute"
          type="number"
          min={0}
          max={120}
          value={minute}
          onChange={(e) => setMinute(e.target.value)}
          placeholder={startMs !== null ? `Auto : ${currentMinute}` : "Ex : 34"}
          className="h-9"
        />
      </div>
      {dialogType === "injury" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Précisions (facultatif)</Label>
          <Input
            name="notes"
            placeholder="Ex : cheville, sortie préventive..."
            className="h-9"
          />
        </div>
      )}
    </form>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4 text-[var(--color-gold)]" />
              Match en direct
            </CardTitle>
            {startMs !== null && (
              <div className="flex items-center gap-2">
                {phase === "playing" && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
                  </span>
                )}
                <span
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 font-mono text-sm font-bold tabular-nums ${
                    phase === "playing"
                      ? "bg-red-50 text-red-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Timer className="h-3.5 w-3.5" />
                  {formatElapsed(elapsedMs)}
                </span>
              </div>
            )}
            {phase === "playing" && (
              <Badge className="bg-red-600 text-white border-red-500 text-[10px]">
                LIVE
              </Badge>
            )}
            {phase === "halftime" && (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                Mi-temps
              </Badge>
            )}
            {phase === "ended" && (
              <Badge className="bg-muted text-muted-foreground border text-[10px]">
                Terminé
              </Badge>
            )}
            {phase === "pre" && (
              <Badge className="bg-muted text-muted-foreground border text-[10px]">
                Non démarré
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isCoach && (
              phase === "pre" ? (
                <Button
                  className="h-10 px-4 text-sm gap-2 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold touch-manipulation"
                  onClick={startMatch}
                  disabled={busyLive}
                >
                  {busyLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Coup d'envoi
                </Button>
              ) : phase === "playing" && !halftimeAt ? (
                <Button
                  variant="outline"
                  className="h-10 px-4 text-sm gap-2 touch-manipulation"
                  onClick={halfTime}
                  disabled={busyLive}
                >
                  {busyLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                  Mi-temps
                </Button>
              ) : phase === "halftime" ? (
                <Button
                  className="h-10 px-4 text-sm gap-2 bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold touch-manipulation"
                  onClick={resumeMatch}
                  disabled={busyLive}
                >
                  {busyLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  2e mi-temps
                </Button>
              ) : phase === "playing" ? (
                <Button
                  variant="outline"
                  className="h-10 px-4 text-sm gap-2 border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-red-50 touch-manipulation"
                  onClick={endMatch}
                  disabled={busyLive}
                >
                  {busyLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                  Fin du match
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-10 px-4 text-sm gap-2 touch-manipulation"
                  onClick={reopenMatch}
                  disabled={busyLive}
                >
                  <RotateCw className="h-4 w-4" />
                  Relancer
                </Button>
              )
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              onClick={fetchEvents}
              aria-label="Actualiser"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {canEdit && (
          <div className="mb-4 grid grid-cols-3 sm:grid-cols-6 gap-2">
            {EVENT_ORDER.map((type) => {
              const cfg = EVENT_TYPE_CONFIG[type];
              return (
                <button
                  key={type}
                  className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card p-3 min-h-[60px] text-center hover:bg-muted/50 active:scale-95 transition-all touch-manipulation"
                  onClick={() => openDialog(type)}
                >
                  <cfg.icon className={`h-5 w-5 ${cfg.iconClass}`} />
                  <span className="text-[11px] font-medium text-muted-foreground leading-tight">{cfg.shortLabel}</span>
                </button>
              );
            })}
          </div>
        )}
        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {canEdit
              ? "Aucun événement. Enregistrez les buts, cartons, changements et blessures."
              : "Aucun événement pour le moment."}
          </p>
        ) : (
          <div className="relative space-y-1">
            {events.map((ev) => {
              const cfg = EVENT_TYPE_CONFIG[ev.event_type as LiveEventType];
              const Icon = cfg?.icon || Activity;
              const { text, detail } = eventSummary(ev, playerList);
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="w-8 shrink-0 text-center text-xs font-bold text-muted-foreground">
                    {ev.minute !== null ? `${ev.minute}'` : "—"}
                  </span>
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      ev.event_type === "red_card"
                        ? "text-red-600"
                        : ev.event_type === "yellow_card"
                          ? "text-yellow-500"
                          : cfg?.iconClass || "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{text}</p>
                    {detail && (
                      <p className="text-xs text-muted-foreground truncate">{detail}</p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-[10px] border ${cfg?.badgeClass || ""}`}>
                    {cfg?.shortLabel || ev.event_type}
                  </Badge>
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleDelete(ev.id, ev.event_type)}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogType !== null} onOpenChange={(open) => !open && setDialogType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType && (() => {
                const Icon = EVENT_TYPE_CONFIG[dialogType].icon;
                return <Icon className={`h-5 w-5 ${EVENT_TYPE_CONFIG[dialogType].iconClass}`} />;
              })()}
              Ajouter — {dialogType ? EVENT_TYPE_CONFIG[dialogType].label : ""}
            </DialogTitle>
          </DialogHeader>
          {dialogFields}
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDialogType(null)}
              disabled={saving}
            >
              <CircleX className="h-3.5 w-3.5 mr-1" />
              Annuler
            </Button>
            <Button
              size="sm"
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              onClick={() => dialogType && handleAdd(dialogType)}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
