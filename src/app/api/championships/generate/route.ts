import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { generatePoolFixtures } from "@/lib/championships/round-robin";
import {
  collectPoolTeams,
  existingOrderedPairs,
  missingPoolFixtureRows,
} from "@/lib/championships/pool-generation";

const GENERIC_ERROR_MESSAGE = "Une erreur est survenue lors de la génération de la poule. Réessayez plus tard.";

function clientError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

type ChampionshipRow = {
  id: string;
  team_id: string;
};

type StandingRow = {
  home_cl_no: number | null;
  home_team_number: number | null;
  home_team: string | null;
  away_cl_no: number | null;
  away_team_number: number | null;
  away_team: string | null;
};

/**
 * POST /api/championships/generate — complète la poule d'un championnat
 * avec le calendrier aller/retour complet (double round-robin), pour les
 * confrontations qui ne sont pas déjà en base.
 *
 * L'import DOFA ne ramène que les matchs de l'équipe suivie : cette route
 * reconstruit les matchs des AUTRES équipes à partir des équipes déjà
 * connues (`championship_standings`). Ne fait qu'INSÉRER les
 * confrontations manquantes — jamais de DELETE, jamais de mise à jour des
 * lignes existantes (règle d'or du chantier DOFA).
 *
 * Idempotente : un ré-appel après une génération complète ne produit
 * aucune insertion.
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return clientError("Corps de requête JSON invalide");
  }

  const championshipId = (body as { championship_id?: unknown }).championship_id;
  if (typeof championshipId !== "string" || !championshipId) {
    return clientError("championship_id requis.");
  }

  const supabase = createAdminClient();

  const { data: championship, error: championshipError } = (await supabase
    .from("championships")
    .select("id, team_id")
    .eq("id", championshipId)
    .maybeSingle()) as { data: ChampionshipRow | null; error: unknown };

  if (championshipError) {
    console.error("[championships/generate] Erreur Supabase (lecture championnat):", championshipError);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  // Indistinguable (même 403 qu'une équipe non coachée) : pas de fuite.
  if (!championship || !(await isTeamCoach(user.id, championship.team_id))) {
    return forbidden();
  }

  const { data: rows, error: rowsError } = (await supabase
    .from("championship_standings")
    .select("home_cl_no, home_team_number, home_team, away_cl_no, away_team_number, away_team")
    .eq("championship_id", championshipId)) as { data: StandingRow[] | null; error: unknown };

  if (rowsError) {
    console.error("[championships/generate] Erreur Supabase (lecture standings):", rowsError);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  const standings = rows ?? [];
  const teams = collectPoolTeams(
    standings.flatMap((row) =>
      typeof row.home_cl_no === "number" && typeof row.home_team_number === "number"
        ? [{ cl_no: row.home_cl_no, number: row.home_team_number, short_name: typeof row.home_team === "string" ? row.home_team : "" }]
        : []
    ).concat(
      standings.flatMap((row) =>
        typeof row.away_cl_no === "number" && typeof row.away_team_number === "number"
          ? [{ cl_no: row.away_cl_no, number: row.away_team_number, short_name: typeof row.away_team === "string" ? row.away_team : "" }]
          : []
      )
    )
  );

  if (teams.length < 2) {
    return NextResponse.json({
      teams: teams.length,
      generated: 0,
      skipped: standings.length,
      message: "Poule incomplète : importez d'abord les matchs de votre équipe (page Championnat, « Ouvrir mes matchs »).",
    });
  }

  const fixtures = generatePoolFixtures(teams);
  const existing = existingOrderedPairs(standings);
  const missing = missingPoolFixtureRows(fixtures, existing, championshipId);

  if (missing.length > 0) {
    const { error: insertError } = await supabase
      .from("championship_standings")
      .insert(missing);

    if (insertError) {
      console.error("[championships/generate] Erreur Supabase (insert):", insertError);
      return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
    }
  }

  return NextResponse.json({
    teams: teams.length,
    generated: missing.length,
    skipped: existing.size,
    total: fixtures.length,
  });
}