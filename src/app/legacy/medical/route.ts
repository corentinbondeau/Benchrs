import { createClient } from "@/lib/supabase/server";
import { renderPage, escapeHtml, formatDateFr } from "@/lib/legacy/html";
import { getLegacyContext } from "@/lib/legacy/session";

/**
 * Page Infirmerie legacy (`/legacy/medical`) — HTML brut, lecture seule.
 * Liste les blessures actives des joueurs de l'équipe courante.
 * `injuries` n'a pas de `team_id` : la jointure se fait via les membres de
 * l'équipe (`player_id ∈ team_members(team_id)`).
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

interface InjuryRow {
  id: string;
  description: string | null;
  injury_type: string | null;
  injury_date: string | null;
  expected_return: string | null;
  status: string | null;
  player?: { first_name?: string | null; last_name?: string | null } | null;
}

function renderInjuryCard(injury: InjuryRow): string {
  const name = `${injury.player?.first_name ?? ""} ${injury.player?.last_name ?? ""}`.trim() || "—";
  const date = formatDateFr(injury.injury_date);
  const expected = formatDateFr(injury.expected_return);

  return `<div class="event-card">
<p class="event-title">${escapeHtml(name)}</p>
<p class="event-date">${escapeHtml(injury.injury_type || "")}${injury.injury_type && injury.description ? " · " : ""}${escapeHtml(injury.description || "")}</p>
<p class="event-date">${date ? `Blessure : ${escapeHtml(date)}` : ""}${expected ? ` · Retour prévu : ${escapeHtml(expected)}` : ""}</p>
</div>`;
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

  let injuries: InjuryRow[] = [];
  try {
    if (ctx.teamId) {
      const supabase = await createClient();
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", ctx.teamId);

      const playerIds = ((teamMembers ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);

      if (playerIds.length > 0) {
        const { data } = await supabase
          .from("injuries")
          .select(
            "id, player_id, description, injury_type, injury_date, expected_return, status, player:profiles!injuries_player_id_fkey(first_name, last_name)"
          )
          .in("player_id", playerIds)
          .eq("status", "active");
        injuries = (data as unknown as InjuryRow[]) || [];
      }
    }
  } catch {
    injuries = [];
  }

  const listBlock =
    injuries.length === 0
      ? `<p>Aucune blessure en cours.</p>`
      : injuries.map(renderInjuryCard).join("\n");

  const body = `<div class="container">
  <h1>Infirmerie</h1>
  ${listBlock}
  <p><a href="/legacy">Retour</a></p>
</div>`;

  return htmlResponse(renderPage({ title: "Benchrs - Infirmerie", body }), 200);
}
