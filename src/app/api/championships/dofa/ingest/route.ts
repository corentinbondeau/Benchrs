import { NextResponse } from "next/server";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateIngestPayload } from "@/lib/dofa/ingest-validation";
import { buildMatchUpserts } from "@/lib/dofa/persist-mapping";
import type { DofaPouleRef } from "@/lib/dofa/types";

/**
 * POST /api/championships/dofa/ingest — LOT 7 (endpoint d'ingestion sécurisé)
 *
 * ⚠️ Point le plus sensible du chantier : le payload reçu ici provient du
 * navigateur du coach (bookmarklet, lot 8), lui-même relayé depuis un site
 * tiers (FFF/DOFA). Rien ne garantit son origine ni son intégrité. Toute la
 * confiance repose sur `validateIngestPayload` (lot 7, fonction pure,
 * réutilisée telle quelle, jamais mockée).
 *
 * Règles de sécurité de cette route :
 *   - authentification obligatoire (401) ;
 *   - autorisation d'ÉCRITURE réservée au coach de l'équipe visée, via
 *     `isTeamCoach` — JAMAIS `isTeamMember` (403 sinon) ;
 *   - aucun détail interne (stack, SQL, nom de colonne) ne fuite dans les
 *     réponses d'erreur : le détail est loggé côté serveur uniquement ;
 *   - garde-fou de fréquence (429) basé sur `championships.last_imported_at`
 *     (colonne du lot 6), sans dépendance de rate-limiting ;
 *   - ⚠️ RÈGLE D'OR : aucun `DELETE` n'est jamais émis par cette route. Un
 *     payload de matchs vide est un no-op valide (200), jamais une purge.
 *     Absence de matchs dans le lot ≠ suppression des matchs déjà connus.
 */

const RATE_LIMIT_WINDOW_MS = 60_000;

const GENERIC_INVALID_PAYLOAD_MESSAGE =
  "Le payload transmis est invalide. Vérifiez le format des données importées.";

interface IngestRequestBody {
  teamId?: string;
  cpNo?: number;
  phase?: number;
  poule?: number;
  matches?: unknown;
}

function isValidRequestShape(
  body: IngestRequestBody
): body is Required<Pick<IngestRequestBody, "teamId" | "cpNo" | "phase" | "poule">> & {
  matches: unknown;
} {
  return (
    typeof body.teamId === "string" &&
    typeof body.cpNo === "number" &&
    typeof body.phase === "number" &&
    typeof body.poule === "number"
  );
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let body: IngestRequestBody;
  try {
    body = (await req.json()) as IngestRequestBody;
  } catch {
    return NextResponse.json({ error: GENERIC_INVALID_PAYLOAD_MESSAGE }, { status: 400 });
  }

  if (!isValidRequestShape(body)) {
    return NextResponse.json(
      { error: "teamId, cpNo, phase, poule sont requis." },
      { status: 400 }
    );
  }

  if (!(await isTeamCoach(user.id, body.teamId))) {
    return forbidden();
  }

  const triplet: DofaPouleRef = { cp_no: body.cpNo, phase: body.phase, poule: body.poule };
  const rawBody = JSON.stringify(body.matches ?? []);

  const validation = validateIngestPayload({ rawBody, triplet });
  if (!validation.ok) {
    // Détail complet loggé côté serveur uniquement — jamais renvoyé au client.
    console.error(
      `[dofa/ingest] Payload invalide (reason=${validation.reason}): ${validation.message}`
    );
    return NextResponse.json({ error: GENERIC_INVALID_PAYLOAD_MESSAGE }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: championship, error: championshipError } = await supabase
    .from("championships")
    .select("id, last_imported_at")
    .eq("team_id", body.teamId)
    .eq("dofa_cp_no", body.cpNo)
    .eq("dofa_phase", body.phase)
    .maybeSingle();

  if (championshipError) {
    console.error("[dofa/ingest] Erreur Supabase (lecture championnat):", championshipError);
    return NextResponse.json({ error: GENERIC_INVALID_PAYLOAD_MESSAGE }, { status: 400 });
  }

  if (!championship) {
    return NextResponse.json(
      { error: "Championnat introuvable pour ce triplet de poule." },
      { status: 400 }
    );
  }

  if (championship.last_imported_at) {
    const elapsed = Date.now() - new Date(championship.last_imported_at as string).getTime();
    if (elapsed < RATE_LIMIT_WINDOW_MS) {
      return NextResponse.json(
        { error: "Un import a déjà eu lieu il y a moins de 60 secondes. Réessayez plus tard." },
        { status: 429 }
      );
    }
  }

  const championshipId = championship.id as string;

  const { data: existingRows } = await supabase
    .from("championship_standings")
    .select("dofa_ma_no")
    .eq("championship_id", championshipId);

  const existingMaNos = new Set(
    (existingRows ?? []).map((row: { dofa_ma_no: number }) => row.dofa_ma_no)
  );

  const matchUpserts = buildMatchUpserts(validation.matches, championshipId);

  let imported = 0;
  let updated = 0;
  const skipped = 0;

  for (const match of validation.matches) {
    if (existingMaNos.has(match.maNo)) {
      updated += 1;
    } else {
      imported += 1;
    }
  }

  // ⚠️ RÈGLE D'OR : jamais de DELETE ici. Un lot vide (matchUpserts.length
  // === 0) produit simplement... aucun appel d'écriture : c'est un no-op
  // strict, pas une purge des matchs déjà en base.
  if (matchUpserts.length > 0) {
    const { error: upsertError } = await supabase
      .from("championship_standings")
      .upsert(matchUpserts, { onConflict: "championship_id,dofa_ma_no" });

    if (upsertError) {
      console.error("[dofa/ingest] Erreur Supabase (upsert matchs):", upsertError);
      return NextResponse.json({ error: GENERIC_INVALID_PAYLOAD_MESSAGE }, { status: 400 });
    }
  }

  await supabase
    .from("championships")
    .update({ last_imported_at: new Date().toISOString() })
    .eq("id", championshipId);

  return NextResponse.json({ imported, updated, skipped, source: "dofa_import" });
}
