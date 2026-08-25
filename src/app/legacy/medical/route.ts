import { createClient } from "@/lib/supabase/server";
import { renderPage, escapeHtml, field, formatDateFr, pageHeader, emptyState, bottomNav } from "@/lib/legacy/html";
import { getLegacyContext } from "@/lib/legacy/session";

/**
 * Page Infirmerie legacy (`/legacy/medical`) — HTML brut, zéro React, zéro JS.
 * Liste les blessures actives des joueurs de l'équipe courante, et permet
 * d'en déclarer une nouvelle ou de clôturer ("marquer rétabli") une blessure
 * en cours via des formulaires POST natifs.
 *
 * `injuries` n'a pas de `team_id` implicite côté lecture historique : la
 * jointure se faisait via les membres de l'équipe (`player_id ∈
 * team_members(team_id)`). En écriture, la table a bien une colonne
 * `team_id` et la policy RLS ("Members can manage injuries") exige
 * `team_id ∈ team_members(auth.uid())` pour insert/update : on passe
 * toujours par le client de session (jamais le service role), et l'insert
 * inclut explicitement `team_id: ctx.teamId`.
 *
 * Sécurité : le `playerId` soumis à la déclaration est revalidé côté serveur
 * contre le roster de l'équipe courante (playerIds issus de team_members)
 * avant tout insert, pour empêcher de déclarer une blessure sur un joueur
 * hors équipe. Pour la clôture, `injuryId` est mis à jour via
 * `.eq("id", injuryId)` : la RLS filtre silencieusement les lignes hors
 * périmètre (0 ligne affectée, pas de fuite d'information).
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

interface RosterPlayer {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

function renderInjuryCard(injury: InjuryRow): string {
  const name = `${injury.player?.first_name ?? ""} ${injury.player?.last_name ?? ""}`.trim() || "—";
  const date = formatDateFr(injury.injury_date);
  const expected = formatDateFr(injury.expected_return);

  return `<div class="event-card">
<p class="event-title">${escapeHtml(name)}</p>
<p class="event-date">${escapeHtml(injury.injury_type || "")}${injury.injury_type && injury.description ? " · " : ""}${escapeHtml(injury.description || "")}</p>
<p class="event-date">${date ? `Blessure : ${escapeHtml(date)}` : ""}${expected ? ` · Retour prévu : ${escapeHtml(expected)}` : ""}</p>
<form method="POST" action="/legacy/medical">
<input type="hidden" name="action" value="recover">
<input type="hidden" name="injuryId" value="${escapeHtml(injury.id)}">
<button type="submit" class="btn-secondary">Marquer rétabli</button>
</form>
</div>`;
}

function renderPlayerOption(player: RosterPlayer): string {
  const name = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() || "—";
  return `<option value="${escapeHtml(player.id)}">${escapeHtml(name)}</option>`;
}

function renderMedicalPage(options: {
  injuries: InjuryRow[];
  roster: RosterPlayer[];
  role: import("@/lib/legacy/nav").LegacyRole;
  ok?: boolean;
  error?: string;
}): string {
  const { injuries, roster, role, ok, error } = options;

  const confirmationBlock = ok ? `<p class="confirmation">Enregistré.</p>` : "";
  const errorBlock = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  const listBlock =
    injuries.length === 0
      ? emptyState({ icon: "＋", title: "Aucune blessure en cours", description: "Tous les joueurs sont en forme." })
      : injuries.map(renderInjuryCard).join("\n");

  const optionsBlock = roster.map(renderPlayerOption).join("\n");

  const body = `<div class="container">
  ${pageHeader({ title: "Infirmerie", subtitle: "Blessures en cours", actionHref: "#form", actionLabel: "Signaler" })}
  ${confirmationBlock}
  ${errorBlock}
  ${listBlock}
  <div id="form" class="page-header" style="margin-top:8px;"><h1 class="page-title">Déclarer une blessure</h1></div>
  <form method="POST" action="/legacy/medical">
<label for="playerId">Joueur</label>
<select id="playerId" name="playerId">
${optionsBlock}
</select>
${field({ name: "description", label: "Description", type: "text" })}
${field({ name: "injuryType", label: "Type (optionnel)", type: "text" })}
${field({ name: "injuryDate", label: "Date de la blessure", type: "date" })}
<p class="help-text">Format : AAAA-MM-JJ</p>
${field({ name: "expectedReturn", label: "Retour prévu (optionnel)", type: "date" })}
<p class="help-text">Format : AAAA-MM-JJ</p>
<button type="submit">Déclarer la blessure</button>
</form>
</div>`;

  return renderPage({ title: "Benchrs - Infirmerie", body, bottomNavHtml: bottomNav(role, "medical") });
}

async function fetchRosterAndInjuries(
  teamId: string | null
): Promise<{ injuries: InjuryRow[]; roster: RosterPlayer[]; playerIds: string[] }> {
  let injuries: InjuryRow[] = [];
  let roster: RosterPlayer[] = [];
  let playerIds: string[] = [];

  try {
    if (teamId) {
      const supabase = await createClient();
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId);

      playerIds = ((teamMembers ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);

      if (playerIds.length > 0) {
        const { data: rosterData } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, shirt_number")
          .in("id", playerIds)
          .eq("is_active", true);

        roster = ((rosterData as RosterPlayer[]) || []).sort((a, b) => {
          const nameA = `${a.last_name ?? ""} ${a.first_name ?? ""}`.trim();
          const nameB = `${b.last_name ?? ""} ${b.first_name ?? ""}`.trim();
          return nameA.localeCompare(nameB);
        });

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
    roster = [];
  }

  return { injuries, roster, playerIds };
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const ok = url.searchParams.get("ok") === "1";

  const { injuries, roster } = await fetchRosterAndInjuries(ctx.teamId);

  return htmlResponse(renderMedicalPage({ injuries, roster, role: ctx.role, ok }), 200);
}

export async function POST(request: Request) {
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

  if (!ctx.teamId) {
    const { injuries, roster } = await fetchRosterAndInjuries(ctx.teamId);
    return htmlResponse(
      renderMedicalPage({ injuries, roster, role: ctx.role, error: "Aucune équipe associée." }),
      400
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const { injuries, roster } = await fetchRosterAndInjuries(ctx.teamId);
    return htmlResponse(
      renderMedicalPage({ injuries, roster, role: ctx.role, error: "Requête invalide, veuillez réessayer." }),
      400
    );
  }

  const action = String(formData.get("action") ?? "");

  if (action === "recover") {
    const injuryId = String(formData.get("injuryId") ?? "");

    if (!injuryId) {
      const { injuries, roster } = await fetchRosterAndInjuries(ctx.teamId);
      return htmlResponse(
        renderMedicalPage({ injuries, roster, role: ctx.role, error: "Blessure invalide." }),
        400
      );
    }

    try {
      const supabase = await createClient();
      // Update via la session utilisateur : la RLS filtre les lignes hors
      // périmètre (0 ligne affectée si l'id n'appartient pas à l'équipe).
      await supabase.from("injuries").update({ status: "recovered" }).eq("id", injuryId);
    } catch {
      const { injuries, roster } = await fetchRosterAndInjuries(ctx.teamId);
      return htmlResponse(
        renderMedicalPage({ injuries, roster, role: ctx.role, error: "Une erreur est survenue, veuillez réessayer." }),
        400
      );
    }

    return redirectTo("/legacy/medical?ok=1");
  }

  const playerId = String(formData.get("playerId") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const injuryType = String(formData.get("injuryType") ?? "").trim();
  const injuryDate = String(formData.get("injuryDate") ?? "").trim();
  const expectedReturn = String(formData.get("expectedReturn") ?? "").trim();

  const { injuries, roster, playerIds } = await fetchRosterAndInjuries(ctx.teamId);

  if (!playerId || !description || !injuryDate) {
    return htmlResponse(
      renderMedicalPage({ injuries, roster, role: ctx.role, error: "Champs obligatoires manquants." }),
      400
    );
  }

  // Validation sécurité : le joueur ciblé doit appartenir au roster de
  // l'équipe courante (empêche d'injecter une blessure hors équipe).
  if (!playerIds.includes(playerId)) {
    return htmlResponse(
      renderMedicalPage({ injuries, roster, role: ctx.role, error: "Joueur invalide." }),
      400
    );
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("injuries").insert({
      player_id: playerId,
      description,
      injury_type: injuryType || null,
      injury_date: injuryDate,
      expected_return: expectedReturn || null,
      status: "active",
      reported_by: ctx.userId,
      team_id: ctx.teamId,
    });

    if (error) {
      return htmlResponse(
        renderMedicalPage({ injuries, roster, role: ctx.role, error: "Une erreur est survenue, veuillez réessayer." }),
        400
      );
    }
  } catch {
    return htmlResponse(
      renderMedicalPage({ injuries, roster, role: ctx.role, error: "Une erreur est survenue, veuillez réessayer." }),
      400
    );
  }

  return redirectTo("/legacy/medical?ok=1");
}
