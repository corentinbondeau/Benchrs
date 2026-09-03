import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seasonDateRange } from "@/lib/goals";

export interface SeasonMatchSummary {
  id: string;
  date: string;
  opponent: string | null;
  scoreUs: number | null;
  scoreThem: number | null;
  result: "V" | "N" | "D" | null;
}

export interface SeasonPlayerSummary {
  playerId: string;
  name: string;
  position: string | null;
  matches: number;
  goals: number;
  assists: number;
  minutes: number;
  yellowCards: number;
  redCards: number;
  attendancePct: number;
  convoked: number;
  avgRating: number | null;
  motm: number;
}

export interface SeasonData {
  teamName: string;
  season: string;
  matches: SeasonMatchSummary[];
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  players: SeasonPlayerSummary[];
  topScorers: { name: string; goals: number }[];
  topAssists: { name: string; assists: number }[];
  bestRated: { name: string; avg: number }[];
  mostPresent: { name: string; pct: number }[];
}

interface MatchRow {
  id: string;
  title: string;
  opponent: string | null;
  event_date: string;
  score_us: number | null;
  score_them: number | null;
  match_result: "win" | "loss" | "draw" | null;
}

interface Agg {
  goals: number;
  assists: number;
  minutes: number;
  yellowCards: number;
  redCards: number;
  playedMatches: Set<string>;
  present: number;
  total: number;
  ratingSum: number;
  ratingCount: number;
  motmMatches: Set<string>;
}

function emptyAgg(): Agg {
  return {
    goals: 0,
    assists: 0,
    minutes: 0,
    yellowCards: 0,
    redCards: 0,
    playedMatches: new Set<string>(),
    present: 0,
    total: 0,
    ratingSum: 0,
    ratingCount: 0,
    motmMatches: new Set<string>(),
  };
}

export async function fetchSeasonData(
  supabase: SupabaseClient,
  teamId: string,
  season: string
): Promise<SeasonData> {
  const range = seasonDateRange(season);
  if (!range) throw new Error("Saison invalide");

  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, opponent, event_date, score_us, score_them, match_result")
    .eq("team_id", teamId)
    .eq("type", "match")
    .gte("event_date", startISO)
    .lte("event_date", endISO)
    .order("event_date", { ascending: true });

  const matches: SeasonMatchSummary[] = ((events as MatchRow[] | null) || []).map((m) => ({
    id: m.id,
    date: m.event_date,
    opponent: m.opponent,
    scoreUs: m.score_us,
    scoreThem: m.score_them,
    result: m.match_result === "win" ? "V" : m.match_result === "draw" ? "N" : m.match_result === "loss" ? "D" : null,
  }));

  const matchIds = matches.map((m) => m.id);
  const emptyRows = { data: [] as unknown[] };

  const nowISO = new Date().toISOString();
  const { data: trainingEvents } = await supabase
    .from("events")
    .select("id")
    .eq("team_id", teamId)
    .eq("type", "training")
    .neq("status", "cancelled")
    .gte("event_date", startISO)
    .lte("event_date", endISO < nowISO ? endISO : nowISO);
  const trainingIds = ((trainingEvents as { id: string }[] | null) || []).map((e) => e.id);

  const { data: statsRaw } = matchIds.length
    ? await supabase.from("match_stats").select("event_id, player_id, goals, assists, yellow_cards, red_cards, minutes_played").in("event_id", matchIds)
    : emptyRows;
  const { data: attRaw } = trainingIds.length
    ? await supabase.from("attendances").select("event_id, user_id, status").in("event_id", trainingIds)
    : emptyRows;
  const { data: ratingsRaw } = matchIds.length
    ? await supabase.from("match_ratings").select("player_id, rating").in("event_id", matchIds)
    : emptyRows;
  const { data: motmRaw } = matchIds.length
    ? await supabase.from("motm_votes").select("event_id, candidate_id").in("event_id", matchIds)
    : emptyRows;

  const stats = statsRaw as { event_id: string; player_id: string; goals: number; assists: number; yellow_cards: number; red_cards: number; minutes_played: number }[];
  const atts = attRaw as { event_id: string; user_id: string; status: string }[];
  const ratings = ratingsRaw as { player_id: string; rating: number }[];
  const motm = motmRaw as { event_id: string; candidate_id: string }[];

  const agg = new Map<string, Agg>();
  const getAgg = (id: string) => {
    let a = agg.get(id);
    if (!a) {
      a = emptyAgg();
      agg.set(id, a);
    }
    return a;
  };

  for (const s of stats) {
    const a = getAgg(s.player_id);
    a.goals += s.goals || 0;
    a.assists += s.assists || 0;
    a.minutes += s.minutes_played || 0;
    a.yellowCards += s.yellow_cards || 0;
    a.redCards += s.red_cards || 0;
    a.playedMatches.add(s.event_id);
  }

  // MVP : le(s) joueur(s) avec le plus de votes par match comptent 1 « fois joueur du match »
  const votesByMatch = new Map<string, Map<string, number>>();
  for (const v of motm) {
    let m = votesByMatch.get(v.event_id);
    if (!m) {
      m = new Map();
      votesByMatch.set(v.event_id, m);
    }
    m.set(v.candidate_id, (m.get(v.candidate_id) || 0) + 1);
  }
  for (const [eventId, perMatch] of votesByMatch) {
    let max = 0;
    for (const n of perMatch.values()) max = Math.max(max, n);
    for (const [cand, n] of perMatch) {
      if (n === max && n > 0) getAgg(cand).motmMatches.add(eventId);
    }
  }

  for (const r of ratings) {
    const a = getAgg(r.player_id);
    a.ratingSum += r.rating;
    a.ratingCount += 1;
  }

  const eventsPerPlayer = new Map<string, number>();
  for (const a of atts) eventsPerPlayer.set(a.user_id, (eventsPerPlayer.get(a.user_id) || 0) + 1);
  for (const a of atts) {
    const aggP = getAgg(a.user_id);
    aggP.total = eventsPerPlayer.get(a.user_id) || 0;
    if (a.status === "present" || a.status === "late") aggP.present += 1;
  }

  const playerIds = [...agg.keys()];
  const { data: profiles } = playerIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, position").in("id", playerIds)
    : emptyRows;
  const profilesList = profiles as { id: string; first_name: string; last_name: string; position: string | null }[] | null;

  const nameById = new Map<string, string>();
  const positionById = new Map<string, string | null>();
  for (const p of profilesList || []) {
    nameById.set(p.id, `${p.first_name} ${p.last_name}`.trim());
    positionById.set(p.id, p.position);
  }

  const players: SeasonPlayerSummary[] = [...agg.entries()].map(([playerId, a]) => ({
    playerId,
    name: nameById.get(playerId) || "Joueur",
    position: positionById.get(playerId) || null,
    matches: a.playedMatches.size,
    goals: a.goals,
    assists: a.assists,
    minutes: a.minutes,
    yellowCards: a.yellowCards,
    redCards: a.redCards,
    attendancePct: a.total > 0 ? Math.round((a.present / a.total) * 100) : 0,
    convoked: a.total,
    avgRating: a.ratingCount > 0 ? Math.round((a.ratingSum / a.ratingCount) * 10) / 10 : null,
    motm: a.motmMatches.size,
  }));

  const wins = matches.filter((m) => m.result === "V").length;
  const draws = matches.filter((m) => m.result === "N").length;
  const losses = matches.filter((m) => m.result === "D").length;
  const goalsFor = matches.reduce((s, m) => s + (m.scoreUs || 0), 0);
  const goalsAgainst = matches.reduce((s, m) => s + (m.scoreThem || 0), 0);

  const topScorers = [...players]
    .filter((p) => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, 5)
    .map((p) => ({ name: p.name, goals: p.goals }));

  const topAssists = [...players]
    .filter((p) => p.assists > 0)
    .sort((a, b) => b.assists - a.assists)
    .slice(0, 5)
    .map((p) => ({ name: p.name, assists: p.assists }));

  const bestRated = [...players]
    .filter((p) => p.avgRating !== null)
    .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
    .slice(0, 5)
    .map((p) => ({ name: p.name, avg: p.avgRating ?? 0 }));

  const mostPresent = [...players]
    .filter((p) => p.convoked > 0)
    .sort((a, b) => b.attendancePct - a.attendancePct)
    .slice(0, 5)
    .map((p) => ({ name: p.name, pct: p.attendancePct }));

  const { data: team } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const teamName = (team as { name?: string } | null)?.name ?? "";

  return {
    teamName,
    season,
    matches,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    players,
    topScorers,
    topAssists,
    bestRated,
    mostPresent,
  };
}
