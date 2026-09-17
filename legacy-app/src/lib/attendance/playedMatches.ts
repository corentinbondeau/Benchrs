import { createClient } from "@/lib/supabase/client";

export interface PlayedMatch {
  event_id: string;
  event_date: string;
}

async function fetchPastMatchEvents(teamId: string, opts?: { minDate?: string; maxDate?: string }) {
  const supabase = createClient();
  let query = supabase
    .from("events")
    .select("id, event_date")
    .eq("team_id", teamId)
    .eq("type", "match")
    .neq("status", "cancelled")
    .lte("event_date", new Date().toISOString());
  if (opts?.minDate) query = query.gte("event_date", opts.minDate);
  if (opts?.maxDate) query = query.lte("event_date", opts.maxDate);
  return query;
}

export async function fetchPlayedMatches(
  teamId: string,
  playerId: string,
  opts?: { minDate?: string; maxDate?: string }
): Promise<PlayedMatch[]> {
  const { data: events } = await fetchPastMatchEvents(teamId, opts);
  const eventIds = (events || []).map((e) => e.id as string);
  if (eventIds.length === 0) return [];

  const supabase = createClient();
  const { data: atts } = await supabase
    .from("attendances")
    .select("event_id")
    .eq("user_id", playerId)
    .eq("team_id", teamId)
    .in("event_id", eventIds)
    .in("status", ["present", "late"]);
  const present = new Set((atts || []).map((a) => a.event_id as string));

  return (events || [])
    .filter((e) => present.has(e.id as string))
    .map((e) => ({ event_id: e.id as string, event_date: e.event_date as string }));
}

export async function fetchTeamPlayedMatchCounts(teamId: string): Promise<Record<string, number>> {
  const { data: events } = await fetchPastMatchEvents(teamId);
  const eventIds = (events || []).map((e) => e.id as string);
  if (eventIds.length === 0) return {};

  const supabase = createClient();
  const { data: atts } = await supabase
    .from("attendances")
    .select("user_id")
    .eq("team_id", teamId)
    .in("event_id", eventIds)
    .in("status", ["present", "late"]);

  const counts: Record<string, number> = {};
  for (const a of atts || []) {
    const uid = a.user_id as string;
    counts[uid] = (counts[uid] || 0) + 1;
  }
  return counts;
}