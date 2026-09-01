import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamMember, isTeamCoach } from "@/lib/api-auth";
import { computeStandings, isPartialCoverage, resolveStandings } from "@/lib/dofa";
import type { DofaMatch } from "@/lib/dofa/parse-matches";

/**
 * Reconstruit, à partir d'une ligne `championship_standings`, le sous-
 * ensemble de champs de `DofaMatch` exploité par `computeStandings`
 * (identité des équipes + score + forfait). Les autres champs de
 * `DofaMatch` (maNo, matchday, location, status…) n'influencent pas le
 * calcul du classement : ils sont renseignés avec des valeurs neutres,
 * jamais lues par `computeStandings`.
 *
 * Retourne `null` si l'identité d'équipe (home/away `cl_no` + `number`,
 * migration 086) est incomplète — cas des lignes importées AVANT cette
 * migration, jamais rétro-remplies (pas d'UPDATE sur l'historique). Ces
 * lignes sont ignorées proprement du calcul plutôt que de risquer une
 * fusion erronée par nom : un ré-import de la poule DOFA les complète.
 */
function toDofaMatchForStandings(row: Record<string, unknown>): DofaMatch | null {
  const homeClNo = row.home_cl_no;
  const homeNumber = row.home_team_number;
  const awayClNo = row.away_cl_no;
  const awayNumber = row.away_team_number;

  if (
    typeof homeClNo !== "number" ||
    typeof homeNumber !== "number" ||
    typeof awayClNo !== "number" ||
    typeof awayNumber !== "number"
  ) {
    return null;
  }

  return {
    maNo: typeof row.dofa_ma_no === "number" ? row.dofa_ma_no : 0,
    matchday: typeof row.matchday_number === "number" ? row.matchday_number : null,
    kickoff: typeof row.kickoff === "string" ? row.kickoff : null,
    date: typeof row.kickoff === "string" ? row.kickoff : "",
    homeTeam: {
      clNo: homeClNo,
      number: homeNumber,
      shortName: typeof row.home_team === "string" ? row.home_team : "",
    },
    awayTeam: {
      clNo: awayClNo,
      number: awayNumber,
      shortName: typeof row.away_team === "string" ? row.away_team : "",
    },
    homeScore: typeof row.home_score === "number" ? row.home_score : null,
    awayScore: typeof row.away_score === "number" ? row.away_score : null,
    homeIsForfeit: row.home_is_forfeit === true,
    awayIsForfeit: row.away_is_forfeit === true,
    location: null,
    seemsPostponed: row.postponed === true,
    status: null,
  };
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id");

  if (!teamId || !(await isTeamMember(user.id, teamId))) {
    return forbidden();
  }

  const supabase = createAdminClient();
  const { data: championships } = await supabase
    .from("championships")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (!championships) {
    return NextResponse.json([]);
  }

  // Le classement affiché au coach est calculé côté serveur, à partir des
  // matchs importés (`championship_standings`), plutôt que dans la page :
  // cette route est le seul point qui lit déjà ces lignes pour construire
  // la réponse, et centraliser le calcul ici évite de dupliquer la logique
  // d'agrégation (et le risque de fusion par nom) dans chaque consommateur
  // futur de l'API (page web actuelle, appli mobile éventuelle, etc.).
  // Le classement officiel FFF n'est pas branché ici (service bloqué,
  // cf. dofa/route.ts) : `resolveStandings` basculerait dessus s'il
  // devenait disponible, sans changement côté client.
  const results = await Promise.all(
    championships.map(async (c) => {
      const { data: rows } = await supabase
        .from("championship_standings")
        .select("*")
        .eq("championship_id", c.id);

      const matches = (rows || [])
        .map((row) => toDofaMatchForStandings(row as Record<string, unknown>))
        .filter((m): m is DofaMatch => m !== null);

      const { rows: standings, source: standings_source } = resolveStandings(
        (c as Record<string, unknown>).official_standings,
        matches
      );
      const standings_coverage = standings_source === "official"
        ? "full" as const
        : isPartialCoverage(matches, standings.length) ? "partial" as const : "full" as const;

      const teams = standings.map((row) => ({
        id: `${row.clNo}/${row.number}`,
        team_name: row.shortName,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goals_for: row.goalsFor,
        goals_against: row.goalsAgainst,
        points: row.points,
      }));

      return { ...c, teams, standings_source, standings_coverage };
    })
  );

  return NextResponse.json(results);
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();

  if (!body.team_id || !(await isTeamCoach(user.id, body.team_id))) {
    return forbidden();
  }

  if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 200) {
    return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("championships")
    .insert({
      name: body.name.trim(),
      season: body.season || null,
      level: body.level || null,
      team_id: body.team_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/championships — LOT 10 (glue minimal, aucune règle métier
 * nouvelle) : permet au coach d'attacher/modifier le triplet DOFA
 * (cp_no/phase/poule, cf. `parsePouleUrl`, lot 4) sur un championnat déjà
 * créé. Nécessaire pour que `/api/championships/dofa/ingest` retrouve le
 * championnat correspondant à une poule importée par collage manuel du
 * JSON (cf. `championship/page.tsx`).
 *
 * Ne fait qu'écrire trois entiers déjà validés côté client par
 * `parsePouleUrl` ; revalidés ici (mêmes règles) avant écriture. Aucune
 * logique d'import, de scraping ou d'agrégation n'est ajoutée ici.
 */
const GENERIC_PATCH_ERROR_MESSAGE =
  "Une erreur est survenue lors de la mise à jour du championnat. Réessayez plus tard.";

export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide" }, { status: 400 });
  }
  const { id, cpNo, phase, poule, clNo, teamNumber, teamName } = body as {
    id?: string;
    cpNo?: number;
    phase?: number;
    poule?: number;
    clNo?: number;
    teamNumber?: number;
    teamName?: string;
  };

  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }
  if (
    typeof cpNo !== "number" ||
    typeof phase !== "number" ||
    typeof poule !== "number" ||
    !Number.isInteger(cpNo) ||
    !Number.isInteger(phase) ||
    !Number.isInteger(poule)
  ) {
    return NextResponse.json(
      { error: "Triplet de poule requis : cpNo, phase, poule (nombres entiers)" },
      { status: 400 }
    );
  }

  // Identité d'équipe du coach (clNo/teamNumber) — optionnelle : le coach
  // configure d'abord sa poule, choisit son équipe ensuite (second appel).
  // 🔒 Identité PARTIELLE refusée : clNo et teamNumber vont ensemble ou pas
  // du tout, sinon `planEventSync` filtrerait silencieusement sur une
  // identité incomplète (cf. décision testeur, US import-championnat).
  const hasClNo = clNo !== undefined;
  const hasTeamNumber = teamNumber !== undefined;
  if (hasClNo !== hasTeamNumber) {
    return NextResponse.json(
      { error: "clNo et teamNumber doivent être fournis ensemble, ou omis tous les deux" },
      { status: 400 }
    );
  }
  if (
    hasClNo &&
    (typeof clNo !== "number" ||
      typeof teamNumber !== "number" ||
      !Number.isInteger(clNo) ||
      !Number.isInteger(teamNumber))
  ) {
    return NextResponse.json(
      { error: "clNo et teamNumber doivent être des nombres entiers" },
      { status: 400 }
    );
  }

  // teamName : optionnel, 200 chars max
  if (teamName !== undefined) {
    if (typeof teamName !== "string" || teamName.length > 200) {
      return NextResponse.json(
        { error: "teamName doit être une chaîne de 200 caractères maximum" },
        { status: 400 }
      );
    }
  }

  const supabase = createAdminClient();

  const { data: championship } = await supabase
    .from("championships")
    .select("id, team_id")
    .eq("id", id)
    .maybeSingle();

  if (!championship || !(await isTeamCoach(user.id, championship.team_id))) {
    return forbidden();
  }

  const updatePayload: Record<string, number | string> = {
    dofa_cp_no: cpNo,
    dofa_phase: phase,
    dofa_poule: poule,
  };
  if (hasClNo) {
    updatePayload.dofa_cl_no = clNo as number;
    updatePayload.dofa_team_number = teamNumber as number;
  }
  if (teamName !== undefined) {
    updatePayload.team_name = teamName;
  }

  const { data, error } = await supabase
    .from("championships")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    // Contrainte d'unicité (team_id, dofa_cp_no, dofa_phase, dofa_poule) :
    // cette poule est déjà attachée à un autre championnat de l'équipe.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Cette poule est déjà configurée pour un autre championnat de cette équipe." },
        { status: 409 }
      );
    }
    console.error("[championships/PATCH] Erreur Supabase (update):", error);
    return NextResponse.json({ error: GENERIC_PATCH_ERROR_MESSAGE }, { status: 400 });
  }

  return NextResponse.json(data);
}
