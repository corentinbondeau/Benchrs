import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamMember, isTeamCoach } from "@/lib/api-auth";

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

  const results = await Promise.all(
    championships.map(async (c) => {
      const { data: teams } = await supabase
        .from("championship_standings")
        .select("*")
        .eq("championship_id", c.id);

      return { ...c, teams: teams || [] };
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
 * créé. Nécessaire pour que `/api/championships/dofa/ingest` (lot 7)
 * retrouve le championnat correspondant à une poule importée par le
 * bookmarklet (lot 8) — cf. commentaire de
 * `championship/bookmarklet/receive/page.tsx`.
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
  const { id, cpNo, phase, poule } = body as {
    id?: string;
    cpNo?: number;
    phase?: number;
    poule?: number;
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

  const supabase = createAdminClient();

  const { data: championship } = await supabase
    .from("championships")
    .select("id, team_id")
    .eq("id", id)
    .maybeSingle();

  if (!championship || !(await isTeamCoach(user.id, championship.team_id))) {
    return forbidden();
  }

  const { data, error } = await supabase
    .from("championships")
    .update({ dofa_cp_no: cpNo, dofa_phase: phase, dofa_poule: poule })
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
