import { createClient } from "@/lib/supabase/server";
import { renderPage, escapeHtml } from "@/lib/legacy/html";
import { getLegacyContext } from "@/lib/legacy/session";

/**
 * Page Équipe legacy (`/legacy/roster`) — HTML brut, lecture seule.
 * Liste les membres actifs de l'équipe courante (numéro, nom, rôle).
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

interface MemberRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  shirt_number: number | null;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Responsable",
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
};

function renderMemberRow(member: MemberRow): string {
  const name = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim() || "—";
  const number =
    member.shirt_number !== null && member.shirt_number !== undefined
      ? `#${member.shirt_number}`
      : "";
  const roleLabel = ROLE_LABELS[member.role] ?? member.role;

  return `<div class="event-card">
<p class="event-title">${escapeHtml(number ? `${number} ` : "")}${escapeHtml(name)}</p>
<p class="event-date">${escapeHtml(roleLabel)}</p>
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

  let members: MemberRow[] = [];
  try {
    if (ctx.teamId) {
      const supabase = await createClient();
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", ctx.teamId);

      const rows = (teamMembers ?? []) as Array<{ user_id: string; role: string }>;
      const userIds = rows.map((r) => r.user_id);

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, shirt_number")
          .in("id", userIds)
          .eq("is_active", true);

        const roleByUserId = new Map(rows.map((r) => [r.user_id, r.role]));

        members = ((profiles ?? []) as Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          shirt_number: number | null;
        }>).map((p) => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          shirt_number: p.shirt_number,
          role: roleByUserId.get(p.id) ?? "player",
        }));

        members.sort((a, b) => {
          const an = a.shirt_number ?? Number.MAX_SAFE_INTEGER;
          const bn = b.shirt_number ?? Number.MAX_SAFE_INTEGER;
          if (an !== bn) return an - bn;
          return (a.last_name ?? "").localeCompare(b.last_name ?? "");
        });
      }
    }
  } catch {
    members = [];
  }

  const listBlock =
    members.length === 0
      ? `<p>Aucun joueur dans l'effectif.</p>`
      : members.map(renderMemberRow).join("\n");

  const body = `<div class="container">
  <h1>Équipe</h1>
  ${listBlock}
  <p><a href="/legacy">Retour</a></p>
</div>`;

  return htmlResponse(renderPage({ title: "Benchrs - Équipe", body }), 200);
}
