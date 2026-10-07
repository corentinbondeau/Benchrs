import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TeamSeasonSummary {
  teamId: string;
  teamName: string;
  players: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  attendanceAvg: number | null; // pourcentage de présence (matchs)
  licencesValid: number;
  licencesTotal: number;
  cotisationsExpected: number;
  cotisationsPaid: number;
  income: number;
  expense: number;
}

export interface ClubSeasonReport {
  clubName: string;
  clubFffNumber: string | null;
  season: string;
  teams: TeamSeasonSummary[];
  totals: {
    players: number;
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    licencesValid: number;
    licencesTotal: number;
    cotisationsExpected: number;
    cotisationsPaid: number;
    income: number;
    expense: number;
  };
}

/** Fenêtre d'une saison « YYYY-YYYY+1 » = 1er août → 31 juillet (France). */
export function seasonDateRange(season: string): { start: string; end: string } {
  const [sy, ey] = season.split("-").map(Number);
  if (!sy || !ey) return { start: "", end: "" };
  const start = new Date(Date.UTC(sy, 7, 1, 0, 0, 0)).toISOString();
  const end = new Date(Date.UTC(ey, 6, 31, 23, 59, 59, 999)).toISOString();
  return { start, end };
}

export async function fetchClubSeasonReport(
  supabase: SupabaseClient,
  clubId: string,
  season: string
): Promise<ClubSeasonReport | null> {
  const { data: club } = await supabase
    .from("clubs")
    .select("id, name, fff_number")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return null;

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("club_id", clubId)
    .order("name", { ascending: true });
  const teamRows = (teams || []) as { id: string; name: string }[];
  const teamIds = teamRows.map((t) => t.id);
  const range = seasonDateRange(season);

  const [{ data: events }, { data: membersData }, { data: licencesData }, { data: cotisData }, { data: txData }] =
    await Promise.all([
      teamIds.length
        ? supabase
            .from("events")
            .select("id, team_id, type, status, score_us, score_them, match_result, event_date")
            .in("team_id", teamIds)
            .gte("event_date", range.start)
            .lte("event_date", range.end)
        : { data: [] as Record<string, unknown>[] },
      teamIds.length
        ? supabase
            .from("team_members")
            .select("user_id, team_id, role")
            .in("team_id", teamIds)
        : { data: [] as Record<string, unknown>[] },
      teamIds.length
        ? supabase
            .from("licences")
            .select("team_id, status")
            .in("team_id", teamIds)
            .eq("season", season)
        : { data: [] as Record<string, unknown>[] },
      teamIds.length
        ? supabase
            .from("cotisations")
            .select("team_id, amount_expected, amount_paid")
            .in("team_id", teamIds)
            .eq("season", season)
        : { data: [] as Record<string, unknown>[] },
      teamIds.length
        ? supabase
            .from("treasury_transactions")
            .select("team_id, type, amount, txn_date")
            .in("team_id", teamIds)
            .gte("txn_date", range.start.slice(0, 10))
            .lte("txn_date", range.end.slice(0, 10))
        : { data: [] as Record<string, unknown>[] },
    ]);

  const eventRows = (events || []) as {
    id: string;
    team_id: string;
    type: string;
    status: string;
    score_us: number | null;
    score_them: number | null;
    match_result: string | null;
    event_date: string;
  }[];
  const matchRows = eventRows.filter((e) => e.type === "match" && e.status === "completed");
  const matchIds = matchRows.map((m) => m.id);

  let attRows: { event_id: string; status: string }[] = [];
  if (matchIds.length > 0) {
    const { data } = await supabase
      .from("attendances")
      .select("event_id, status")
      .in("event_id", matchIds);
    attRows = (data || []) as { event_id: string; status: string }[];
  }

  const memberRows = (membersData || []) as { user_id: string; team_id: string; role: string }[];
  const licenceRows = (licencesData || []) as { team_id: string; status: string }[];
  const cotisRows = (cotisData || []) as { team_id: string; amount_expected: number; amount_paid: number }[];
  const txRows = (txData || []) as { team_id: string; type: string; amount: number }[];

  const teamsOut: TeamSeasonSummary[] = teamRows.map((t) => {
    const teamMatches = matchRows.filter((m) => m.team_id === t.id);
    const wins = teamMatches.filter((m) => m.match_result === "win").length;
    const draws = teamMatches.filter((m) => m.match_result === "draw").length;
    const losses = teamMatches.filter((m) => m.match_result === "loss").length;
    const goalsFor = teamMatches.reduce(
      (s, m) => s + ((m.score_us as number | null) ?? 0),
      0
    );
    const goalsAgainst = teamMatches.reduce(
      (s, m) => s + ((m.score_them as number | null) ?? 0),
      0
    );

    const ids = new Set(
      memberRows.filter((m) => m.team_id === t.id && m.role === "player").map((m) => m.user_id)
    );

    const teamMatchIds = new Set(teamMatches.map((m) => m.id));
    let attendanceSum = 0;
    let attendanceEvents = 0;
    for (const mid of teamMatchIds) {
      const rows = attRows.filter((a) => a.event_id === mid);
      const responded = rows.filter((r) => r.status !== "pending");
      if (responded.length === 0) continue;
      const present = responded.filter((r) => r.status === "present" || r.status === "late").length;
      attendanceSum += present / responded.length;
      attendanceEvents += 1;
    }

    const licences = licenceRows.filter((l) => l.team_id === t.id);
    const cotisations = cotisRows.filter((c) => c.team_id === t.id);
    const txs = txRows.filter((x) => x.team_id === t.id);

    return {
      teamId: t.id,
      teamName: t.name,
      players: ids.size,
      matches: teamMatches.length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      attendanceAvg: attendanceEvents > 0 ? Math.round((attendanceSum / attendanceEvents) * 100) : null,
      licencesValid: licences.filter((l) => l.status === "valid").length,
      licencesTotal: licences.length,
      cotisationsExpected: cotisations.reduce((s, c) => s + Number(c.amount_expected), 0),
      cotisationsPaid: cotisations.reduce((s, c) => s + Number(c.amount_paid), 0),
      income: txs.filter((x) => x.type === "income").reduce((s, x) => s + Number(x.amount), 0),
      expense: txs.filter((x) => x.type === "expense").reduce((s, x) => s + Number(x.amount), 0),
    };
  });

  const sum = (pick: (t: TeamSeasonSummary) => number) =>
    teamsOut.reduce((s, t) => s + pick(t), 0);

  return {
    clubName: (club as { name: string }).name || "Club",
    clubFffNumber: (club as { fff_number: string | null }).fff_number ?? null,
    season,
    teams: teamsOut,
    totals: {
      players: sum((t) => t.players),
      matches: sum((t) => t.matches),
      wins: sum((t) => t.wins),
      draws: sum((t) => t.draws),
      losses: sum((t) => t.losses),
      goalsFor: sum((t) => t.goalsFor),
      goalsAgainst: sum((t) => t.goalsAgainst),
      licencesValid: sum((t) => t.licencesValid),
      licencesTotal: sum((t) => t.licencesTotal),
      cotisationsExpected: sum((t) => t.cotisationsExpected),
      cotisationsPaid: sum((t) => t.cotisationsPaid),
      income: sum((t) => t.income),
      expense: sum((t) => t.expense),
    },
  };
}