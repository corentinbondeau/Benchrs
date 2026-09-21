import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { validateJourneesPayload } from "@/lib/dofa/poule-journees";

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
 * Règles de sécurité (alignées sur la route d'ingestion et de standings) :
 *   - 401 sans authentification ;
 *   - 403 si l'utilisateur n'est pas coach de l'équipe propriétaire du
 *     championnat (`isTeamCoach`, jamais `isTeamMember`) — 403 aussi si le
 *     championnat n'existe pas ;
 *   - 400 si `championship_id` ou `journees` sont absents/invalides ;
 *   - erreurs base → message générique, détail loggé côté serveur.
 *
 * La liste est ÉCRASÉE à chaque enregistrement (dernier collage gagne) :
 * c'est une donnée de référence, pas un append. Un collage vide n'est pas
 * un no-op : le coach peut "désactiver" l'étiquetage en collant une liste
 * vide (aucune journée officielle). Aucun DELETE n'est émis par cette route.
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
 * championnat visé. Retourne l'id du championnat si autorisé, sinon null —
 * l'appelant renvoie alors 403 (indistinguable "n'existe pas" / "pas
 * autorisé", même convention que PATCH /api/championships et standings).
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

  const championshipId = await requireCoachForChampionship(user.id, body.championship_id);
  if (!championshipId) return forbidden();

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

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("championships")
    .update({ journees: validation.journees })
    .eq("id", championshipId);

  if (error) {
    console.error("[championships/journees] Erreur Supabase (update):", error);
    return NextResponse.json({ error: GENERIC_ERROR_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ journees: validation.journees });
}