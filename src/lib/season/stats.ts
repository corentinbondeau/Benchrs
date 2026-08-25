import type { SeasonStatsContext } from "./ai-generator";

export async function buildSeasonStatsContext(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  teamId: string,
  month: string | null
): Promise<SeasonStatsContext> {
  const monthStart = month ? new Date(`${month}-01T00:00:00`) : null;
  const monthEnd = monthStart ? new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1) : null;

  const season = currentSeasonLabel();

  const { data: trainingEventsPre } = await supabase
    .from("events")
    .select("id")
    .eq("team_id", teamId)
    .eq("type", "training")
    .gte("event_date", monthStart ? monthStart.toISOString() : "1900-01-01")
    .lt("event_date", monthEnd ? monthEnd.toISOString() : "9999-12-31");
  const trainingIds = (trainingEventsPre || []).map((e) => e.id as string);

  const [
    { data: team },
    { data: events },
    { data: stats },
    { data: attendance },
    { data: players },
    { data: photos },
  ] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
    supabase
      .from("events")
      .select("id, opponent, home_score, away_score, event_date, status")
      .eq("team_id", teamId)
      .eq("type", "match")
      .gte("event_date", monthStart ? monthStart.toISOString() : "1900-01-01")
      .lt("event_date", monthEnd ? monthEnd.toISOString() : "9999-12-31")
      .order("event_date", { ascending: true }),
    supabase
      .from("match_stats")
      .select("player_id, goals, profiles(first_name, last_name)")
      .eq("team_id", teamId),
    trainingIds.length > 0
      ? supabase
          .from("attendances")
          .select("status, event_id")
          .eq("team_id", teamId)
          .in("status", ["present", "absent", "late", "excused"])
          .in("event_id", trainingIds)
      : Promise.resolve({ data: [] as { status: string; event_id: string }[] }),
    supabase
      .from("team_members")
      .select("profile:profiles(id)")
      .eq("team_id", teamId)
      .eq("role", "player"),
    supabase.from("gallery_media").select("id").eq("team_id", teamId),
  ]);

  const completed = (events || []).filter((e) => e.status === "completed");
  const results = completed
    .map((e) => ({
      opponent: (e.opponent as string) || "adversaire",
      scoreFor: Number(e.home_score ?? 0),
      scoreAgainst: Number(e.away_score ?? 0),
      date: e.event_date as string,
    }))
    .filter((r) => r.scoreFor > 0 || r.scoreAgainst > 0 || r.opponent !== "adversaire");

  const won = results.filter((r) => r.scoreFor > r.scoreAgainst).length;
  const drawn = results.filter((r) => r.scoreFor === r.scoreAgainst).length;
  const lost = results.filter((r) => r.scoreFor < r.scoreAgainst).length;
  const goalsCount = results.reduce((s, r) => s + r.scoreFor, 0);

  const goalsByPlayer = new Map<string, number>();
  for (const s of stats || []) {
    const pid = s.player_id as string;
    goalsByPlayer.set(pid, (goalsByPlayer.get(pid) ?? 0) + Number(s.goals ?? 0));
  }
  let topScorer: string | null = null;
  let topGoals = 0;
  for (const [pid, g] of goalsByPlayer) {
    if (g > topGoals) {
      const p = stats?.find((s) => s.player_id === pid);
      const profile = (p as unknown as { profiles?: { first_name?: string; last_name?: string } } | null)?.profiles;
      if (profile?.first_name) {
        topScorer = `${profile.first_name}${profile.last_name ? " " + profile.last_name : ""}`;
        topGoals = g;
      }
    }
  }

  const attendanceForTraining = (attendance || []) as { status: string; event_id?: string }[];
  const attendanceRate =
    attendanceForTraining.length > 0
      ? Math.round(
          (attendanceForTraining.filter((a) => a.status === "present" || a.status === "late").length /
            attendanceForTraining.length) *
            100
        )
      : null;

  const upcomingCount = completed.length === 0 ? (events || []).length : 0;

  return {
    teamName: (team?.name as string) || "Notre équipe",
    season,
    monthLabel: month ? formatMonth(month) : null,
    results,
    topScorer,
    goalsCount,
    attendanceRate,
    upcomingCount,
    photosCount: (photos || []).length,
    playersCount: (players || []).length,
    won,
    drawn,
    lost,
  };
}

export function currentSeasonLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function seasonDateRange(season: string): { start: Date; end: Date } {
  const [a, b] = season.split("-").map((x) => parseInt(x, 10));
  return {
    start: new Date(a, 7, 1),
    end: new Date(b, 6, 31),
  };
}

function formatMonth(month: string): string {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}
