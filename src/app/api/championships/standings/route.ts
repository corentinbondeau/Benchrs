import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";

/**
 * POST/PATCH/DELETE /api/championships/standings — saisie manuelle des
 * résultats de la poule.
 *
 * But : permettre au coach de renseigner le score des AUTRES matchs de la
 * poule (ceux qui n'impliquent pas son équipe) pour tenir le classement à
 * jour, alors que l'import DOFA ne ramène que les matchs du club suivi
 * (`/matchs?clNo=…`). Sans cela, `standings_coverage` reste "partial" et
 * le classement des adversaires est faux.
 *
 * Chaque ligne de `championship_standings` est un match. Les lignes créées
 * ici portent `source = 'manual'` (contrairement aux lignes importées,
 * `source = 'dofa_import'`), ce qui permet de les identifier proprement :
 *   - elles ne sont PAS protégées par la clause d'idempotence
 *     `championship_id + dofa_ma_no` (index partiel WHERE dofa_ma_no IS
 *     NOT NULL ; une ligne manuelle a dofa_ma_no NULL) ;
 *   - elles peuvent être SUPPRIMÉES (un ré-import DOFA ne génère jamais de
 *     DELETE — cf. dotFA ingest) ;
 *   - un ré-import DOFA ne cherche à les écraser que s'il ramène le même
 *     `ma_no`, ce qui ne peut pas arriver pour un match hors club.
 *
 * ⚠️ Contrat de scores : les deux scores sont fournis ensemble (match
 * joué, entiers ≥ 0) ou pas du tout (match non joué), jamais l'un sans
 * l'autre — un 0-0 réel se distingue ainsi d'un match à venir.
 *
 * Règles de sécurité (alignées sur la route d'ingestion) :
 *   - 401 sans authentification ;
 *   - 403 si l'utilisateur n'est pas coach de l'équipe propriétaire du
 *     championnat (`isTeamCoach`, jamais `isTeamMember`) ;
 *   - 403 aussi si le championnat n'existe pas ;
 *   - erreurs base → message générique, détail loggé côté serveur.
 */

const GENERIC_ERROR_MESSAGE =
  "Une erreur est survenue lors de l'enregistrement du résultat. Réessayez plus tard.";

function clientError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Les deux scores sont fournis ensemble (entiers ≥ 0) ou pas du tout. */
function areScoresValid(home: unknown, away: unknown): boolean {
  if (home === null || home === undefined) {
    return away === null || away === undefined;
  }
  return isNonNegativeInt(home) && isNonNegativeInt(away);
}

function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  return req
    .json()
    .then((body) => (body && typeof body === "object" ? (body as Record<string, unknown>) : null))
    .catch(() => null);
}

/**
 * Vérifie que l'utilisateur est coach de l'équipe propriétaire du
 * championnat visé. Retourne l'id du championnat si autorisé, sinon null —
 * l'appelant renvoie alors 403 (indistinguable "n'existe pas" / "pas
 * autorisé", même convention que PATCH /api/championships). La présence et
 * le type de `championship_id` sont validés (400) AVANT cet appel.
 */
async function requireCoachForChampionship(userId: string, championshipId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: championship } = await supabase
    .from("championships")
    .select("id, team_id")
    .eq("id", championshipId)
    .maybeSingle();

  if (!championship || !(await isTeamCoach(userId, championship.team_id as string))) {
    return null;
  }
  return championship.id as string;
}

/**
 * Validation commune aux trois verbes : `championship_id` présent et
 * chaîne non vide, puis garde coach de l'équipe propriétaire. Retourne
 * l'id validé, ou une Response d'erreur (400/403) via `onError`.
 */
function validChampionshipId(body: Record<string, unknown>): { id: string } | { error: Response } {
  if (typeof body.championship_id !== "string" || !body.championship_id) {
    return { error: clientError("championship_id requis") };
  }
  return { id: body.championship_id };
}

/** Insère un match manuellement saisi (`source = 'manual'`). */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await readJsonBody(req);
  if (!body) {
    return clientError("Corps de requête JSON invalide");
  }

  const championshipRef = validChampionshipId(body);
  if ("error" in championshipRef) return championshipRef.error;

  const championshipId = await requireCoachForChampionship(user.id, championshipRef.id);
  if (!championshipId) return forbidden();

  const homeTeam = body.home_team;
  const awayTeam = body.away_team;
  if (
    typeof homeTeam !== "string" ||
    !homeTeam.trim() ||
    typeof awayTeam !== "string" ||
    !awayTeam.trim()
  ) {
    return clientError("Les deux équipes sont requises.");
  }

  const { home_cl_no, home_team_number, away_cl_no, away_team_number } = body;
  if (
    !isNonNegativeInt(home_cl_no) ||
    !isNonNegativeInt(home_team_number) ||
    !isNonNegativeInt(away_cl_no) ||
    !isNonNegativeInt(away_team_number)
  ) {
    return clientError("Identité DOFA des deux équipes requise (cl_no + numéro d'équipe).");
  }
  if (home_cl_no === away_cl_no && home_team_number === away_team_number) {
    return clientError("Les deux équipes doivent être différentes.");
  }

  if (!areScoresValid(body.home_score, body.away_score)) {
    return clientError("Scores invalides : deux entiers >= 0, ou aucun score (match non joué).");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("championship_standings")
    .insert({
      championship_id: championshipId,
      source: "manual",
      matchday_number: isNonNegativeInt(body.matchday_number) ? body.matchday_number : null,
      home_team: homeTeam.trim(),
      away_team: awayTeam.trim(),
      home_cl_no,
      home_team_number,
      away_cl_no,
      away_team_number,
      home_score: body.home_score ?? null,
      away_score: body.away_score ?? null,
      kickoff: typeof body.kickoff === "string" && body.kickoff ? body.kickoff : null,
      location: typeof body.location === "string" && body.location ? body.location : null,
      postponed: false,
      home_is_forfeit: false,
      away_is_forfeit: false,
    })
    .select()
    .single();

  if (error) {
    console.error("[championships/standings] Erreur Supabase (insert):", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  return NextResponse.json(data);
}

/** Met à jour les scores d'un match existant (toute source). */
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await readJsonBody(req);
  if (!body) {
    return clientError("Corps de requête JSON invalide");
  }
  if (typeof body.id !== "string" || !body.id) {
    return clientError("id requis");
  }

  const championshipRef = validChampionshipId(body);
  if ("error" in championshipRef) return championshipRef.error;

  const championshipId = await requireCoachForChampionship(user.id, championshipRef.id);
  if (!championshipId) return forbidden();

  if (body.home_score === undefined || body.away_score === undefined) {
    return clientError("home_score et away_score sont requis.");
  }
  if (!areScoresValid(body.home_score, body.away_score)) {
    return clientError("Scores invalides : deux entiers >= 0, ou aucun score (match non joué).");
  }

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("championship_standings")
    .select("id")
    .eq("id", body.id)
    .eq("championship_id", championshipId)
    .maybeSingle();
  if (!existing) {
    return clientError("Match introuvable.", 404);
  }

  // Un réel score saisi par le coach prime sur un éventuel forfait DOFA :
  // on réarme les flags de forfait à la mise à jour.
  const { data, error } = await supabase
    .from("championship_standings")
    .update({
      home_score: body.home_score ?? null,
      away_score: body.away_score ?? null,
      home_is_forfeit: false,
      away_is_forfeit: false,
    })
    .eq("id", body.id)
    .eq("championship_id", championshipId)
    .select()
    .single();

  if (error) {
    console.error("[championships/standings] Erreur Supabase (update):", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * Supprime un match saisi à la main. Les lignes importées DOFA ne sont
 * jamais supprimables via cette route (elles portent la trace de l'agenda
 * et du verrouillage des événements) — le coach peut en revanche en
 * modifier le score.
 */
export async function DELETE(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await readJsonBody(req);
  if (!body) {
    return clientError("Corps de requête JSON invalide");
  }
  if (typeof body.id !== "string" || !body.id) {
    return clientError("id requis");
  }

  const championshipRef = validChampionshipId(body);
  if ("error" in championshipRef) return championshipRef.error;

  const championshipId = await requireCoachForChampionship(user.id, championshipRef.id);
  if (!championshipId) return forbidden();

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("championship_standings")
    .select("id, source")
    .eq("id", body.id)
    .eq("championship_id", championshipId)
    .maybeSingle();
  if (!existing) {
    return clientError("Match introuvable.", 404);
  }
  if (existing.source !== "manual") {
    return clientError(
      "Ce match provient de l'import DOFA : il ne peut pas être supprimé. Modifiez son score si nécessaire.",
      400
    );
  }

  const { error } = await supabase
    .from("championship_standings")
    .delete()
    .eq("id", body.id)
    .eq("championship_id", championshipId);

  if (error) {
    console.error("[championships/standings] Erreur Supabase (delete):", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}