import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { validateJourneesPayload, type DofaJourneeTriplet } from "@/lib/dofa/poule-journees";
import { buildMatchUpserts } from "@/lib/dofa/persist-mapping";

/**
 * POST /api/championships/journees — enregistre la liste officielle des
 * journées de la poule.
 *
 * But : le coach colle le JSON de la page `poule_journees` du site FFF (la
 * ressource des journalières de la poule) dans un SECOND champ du dialog
 * d'import DOFA, distinct du collage des matchs. Cette liste porte le VRAI
 * calendrier des journées du site (numéro + libellé + date officielle),
 * stockée telle quelle dans `championships.journees` (JSONB, migration 088).
 * Sans elle, les matchs générés automatiquement (round-robin, source
 * 'manual') portent des numéros SYNTHÉTIQUES, et même les matchs importés
 * n'ont pas de libellé officiel à afficher.
 *
 * ⚠️ Lorsque le payload porte, embarqués dans les journées, les MATCHES de
 * la poule (objets développés, page « Journées » ouverte avec la ressource
 * matchs), ils sont IMPORTÉS en base en même temps que les étiquettes :
 * tous les matchs de toutes les journées (y compris ceux où l'équipe suivie
 * ne joue pas). Leur triplet déclaré doit correspondre au triplet du
 * championnat (ancre anti-injection), et l'écriture suit la même RÈGLE D'OR
 * que l'ingestion : jamais de DELETE, un lot vide est un no-op, upsert par
 * `championship_id` + `dofa_ma_no`.
 *
 * Règles de sécurité (alignées sur la route d'ingestion et de standings) :
 *   - 401 sans authentification ;
 *   - 403 si l'utilisateur n'est pas coach de l'équipe propriétaire du
 *     championnat (`isTeamCoach`, jamais `isTeamMember`) — 403 aussi si le
 *     championnat n'existe pas ;
 *   - 400 si `championship_id` ou `journees` sont absents/invalides, ou si
 *     le triplet déclaré des journées ne correspond pas au championnat ;
 *   - erreurs base → message générique, détail loggé côté serveur.
 *
 * La liste des journées est ÉCRASÉE à chaque enregistrement (dernier collage
 * gagne) : c'est une donnée de référence, pas un append. Les MATCHS, eux,
 * sont upsertés (jamais supprimés, jamais écrasés par un lot vide).
 */

const GENERIC_ERROR_MESSAGE =
  "Une erreur est survenue lors de l'enregistrement des journées. Réessayez plus tard.";

function clientError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  return req
    .json()
    .then((body) => (body && typeof body === "object" ? (body as Record<string, unknown>) : null))
    .catch(() => null);
}

/**
 * Vérifie que l'utilisateur est coach de l'équipe propriétaire du
 * championnat visé. Retourne `{ id, triplet }` si autorisé, sinon null —
 * l'appelant renvoie alors 403 (indistinguable "n'existe pas" / "pas
 * autorisé", même convention que PATCH /api/championships et standings).
 * Le triplet (`dofa_cp_no`/`dofa_phase`/`dofa_poule`) sert d'ancre aux
 * matchs embarqués des journées.
 */
async function requireCoachForChampionship(
  userId: string,
  championshipId: string
): Promise<{ id: string; triplet: DofaJourneeTriplet | null } | null> {
  const supabase = createAdminClient();
  const { data: championship } = await supabase
    .from("championships")
    .select("id, team_id, dofa_cp_no, dofa_phase, dofa_poule")
    .eq("id", championshipId)
    .maybeSingle();

  if (!championship || !(await isTeamCoach(userId, championship.team_id as string))) {
    return null;
  }
  const cpNo = championship.dofa_cp_no;
  const phase = championship.dofa_phase;
  const poule = championship.dofa_poule;
  const triplet =
    typeof cpNo === "number" && typeof phase === "number" && typeof poule === "number"
      ? { cp_no: cpNo, phase, poule }
      : null;
  return { id: championship.id as string, triplet };
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await readJsonBody(req);
  if (!body) {
    return clientError("Corps de requête JSON invalide");
  }

  if (typeof body.championship_id !== "string" || !body.championship_id) {
    return clientError("championship_id requis");
  }

  const allowed = await requireCoachForChampionship(user.id, body.championship_id);
  if (!allowed) return forbidden();
  const championshipId = allowed.id;

  // `journees` est la liste brute collée (tableau nu ou enveloppe Hydra) :
  // on re-sérialise en rawBody pour passer par la même frontière de
  // validation pure que l'ingestion de matchs (fichier, JSON, taille...).
  const journees = body.journees;
  if (journees === undefined) {
    return clientError("journees requis");
  }

  const rawBody = JSON.stringify(journees ?? []);
  const validation = validateJourneesPayload({ rawBody });
  if (!validation.ok) {
    // Détail complet loggé côté serveur uniquement — jamais renvoyé au client.
    console.error(
      `[championships/journees] Payload invalide (reason=${validation.reason}): ${validation.message}`
    );
    return clientError("Le payload des journées est invalide. Vérifiez que vous avez collé la bonne page.");
  }

  // ─────────────────────────────────────────────────────────────────────
  // Ancre anti-injection des matchs embarqués : le triplet déclaré par les
  // journées doit correspondre au triplet du championnat (sinon 400). Un
  // payload d'étiquettes seules (sans matchs) n'est pas concerné.
  // ─────────────────────────────────────────────────────────────────────
  if (validation.matches.length > 0 && validation.triplet) {
    if (
      !allowed.triplet ||
      allowed.triplet.cp_no !== validation.triplet.cp_no ||
      allowed.triplet.phase !== validation.triplet.phase ||
      allowed.triplet.poule !== validation.triplet.poule
    ) {
      return clientError(
        "Le triplet de poule des journées collées ne correspond pas au championnat enregistré.",
        400
      );
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("championships")
    .update({ journees: validation.journees })
    .eq("id", championshipId);

  if (error) {
    console.error("[championships/journees] Erreur Supabase (update):", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Import des matchs embarqués dans les journées (tous les matchs de
  // toutes les journées, y compris ceux où l'équipe suivie ne joue pas).
  // RÈGLE D'OR : jamais de DELETE. Un lot sans matchs est un no-op (`matches`
  // vide → aucun appel d'écriture), l'étiquetage seul reste fonctionnel.
  // ─────────────────────────────────────────────────────────────────────
  let imported = 0;
  let updated = 0;

  if (validation.matches.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("championship_standings")
      .select("dofa_ma_no")
      .eq("championship_id", championshipId);

    if (existingError) {
      console.error("[championships/journees] Erreur Supabase (lecture standings):", existingError);
      return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
    }

    const existingMaNos = new Set(
      (existingRows ?? []).map((row: { dofa_ma_no: number }) => row.dofa_ma_no)
    );
    for (const match of validation.matches) {
      if (existingMaNos.has(match.maNo)) updated += 1;
      else imported += 1;
    }

    const matchUpserts = buildMatchUpserts(validation.matches, championshipId);
    if (matchUpserts.length > 0) {
      const { error: upsertError } = await supabase
        .from("championship_standings")
        .upsert(matchUpserts, { onConflict: "championship_id,dofa_ma_no" });

      if (upsertError) {
        console.error("[championships/journees] Erreur Supabase (upsert matchs):", upsertError);
        return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ journees: validation.journees, imported, updated });
}