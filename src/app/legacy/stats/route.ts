import { createClient } from "@/lib/supabase/server";
import { renderPage, escapeHtml } from "@/lib/legacy/html";
import { getLegacyContext } from "@/lib/legacy/session";
import { buildLeaderboard, type RosterPlayer, type MatchStatRow, type AttendanceRow } from "@/lib/stats/buildLeaderboard";

/**
 * Page Performance legacy (`/legacy/stats`) — HTML brut, lecture seule.
 * Tableau de classement : buts, passes, assiduité (via buildLeaderboard).
 */

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

export async function GET() {
  let ctx: Awaited<ReturnType<typeof getLegacyContext>> = null;

  try {
    const supabase = await createClient();
    ctx = await getLegacyContext(supabase);
  } catch {
    ctx = null;
  }

  if (!ctx) {
    return redirectTo("/legacy/login");
  }

  let roster: RosterPlayer[] = [];
  let matchStats: MatchStatRow[] = [];
  let attendances: AttendanceRow[] = [];
  let trainingIds: string[] = [];

  try {
    if (ctx.teamId) {
      const supabase = await createClient();

      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", ctx.teamId);

      const memberRows = (teamMembers ?? []) as Array<{ user_id: string; role: string }>;
      const playerIds = memberRows.map((r) => r.user_id);

      if (playerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, shirt_number")
          .in("id", playerIds)
          .eq("is_active", true);

        roster = ((profiles ?? []) as Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          shirt_number: number | null;
        }>).map((p) => ({
          player_id: p.id,
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          shirt_number: p.shirt_number,
        }));
      }

      const { data: statsData } = await supabase
        .from("match_stats")
        .select("player_id, goals, assists, yellow_cards, red_cards, minutes_played")
        .eq("team_id", ctx.teamId);
      matchStats = (statsData as MatchStatRow[]) || [];

      const { data: trainingEvents } = await supabase
        .from("events")
        .select("id")
        .eq("team_id", ctx.teamId)
        .eq("type", "training");
      trainingIds = ((trainingEvents ?? []) as Array<{ id: string }>).map((e) => e.id);

      if (trainingIds.length > 0) {
        const { data: attData } = await supabase
          .from("attendances")
          .select("user_id, event_id, status")
          .in("event_id", trainingIds);
        attendances = (attData as AttendanceRow[]) || [];
      }
    }
  } catch {
    roster = [];
    matchStats = [];
    attendances = [];
    trainingIds = [];
  }

  const entries = buildLeaderboard(roster, matchStats, attendances, trainingIds).sort(
    (a, b) => b.goals - a.goals
  );

  let bodyContent: string;
  if (entries.length === 0) {
    bodyContent = `<p>Aucun joueur dans l'effectif.</p>`;
  } else {
    const rows = entries
      .map((e) => {
        const name = `${e.first_name} ${e.last_name}`.trim() || "—";
        return `<tr>
<td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(name)}</td>
<td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${e.goals}</td>
<td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${e.assists}</td>
<td style="padding:8px;border:1px solid #e5e7eb;text-align:center;">${e.attendance_rate}%</td>
</tr>`;
      })
      .join("\n");

    bodyContent = `<table style="width:100%;border-collapse:collapse;font-size:13px;">
<thead>
<tr>
<th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Joueur</th>
<th style="padding:8px;border:1px solid #e5e7eb;">Buts</th>
<th style="padding:8px;border:1px solid #e5e7eb;">Passes</th>
<th style="padding:8px;border:1px solid #e5e7eb;">Assiduité</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>`;
  }

  const body = `<div class="container">
  <h1>Performance</h1>
  ${bodyContent}
  <p><a href="/legacy">Retour</a></p>
</div>`;

  return htmlResponse(renderPage({ title: "Benchrs - Performance", body }), 200);
}
