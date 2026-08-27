import { NextResponse } from "next/server";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchPouleResultats,
  fetchPouleCalendrier,
  fetchPouleClassement,
  fetchPouleMatchs,
  fetchPouleJournees,
  fetchPoule,
} from "@/lib/dofa";
import type { DofaUnavailableError, ParsedDofaMatch } from "@/lib/dofa";

const DOFA_UNAVAILABLE_MESSAGE =
  "Le service FFF (DOFA) est actuellement indisponible. Utilisez l'import manuel en attendant le rétablissement du service.";

/**
 * ⚠️ Route de secours documentée : l'API DOFA (`api-dofa.fff.fr`) est
 * aujourd'hui bloquée par Akamai (403) en production, quel que soit
 * l'endpoint appelé. Cette route reste implémentée et testée pour le jour où
 * l'accès se rouvrirait (ou serait débloqué via un accord FFF) — elle ne
 * doit pas être confondue avec du code mort : elle documente le contrat
 * cible (triplet cpNo/phase/poule, modèle compétition) vers lequel migrer
 * dès que l'accès réseau est de nouveau possible. En attendant, elle répond
 * systématiquement 502 avec un message explicite, jamais un 200 silencieux.
 * Le chemin opérationnel actuel pour le coach reste l'import manuel (collage
 * de HTML / bookmarklet, cf. `championship/page.tsx`, dialog « Import
 * manuel »), volontairement non touché par ce refactor.
 */

/**
 * Duck-typing plutôt que `instanceof DofaUnavailableError` : la classe réelle
 * est importée depuis @/lib/dofa, mais ce module peut être mocké dans les
 * tests (vi.mock) sans exporter la classe elle-même. On identifie donc
 * l'erreur par sa forme (reason typé + éventuel status).
 */
function isDofaUnavailableError(error: unknown): error is DofaUnavailableError {
  return (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    ["network", "blocked", "http"].includes((error as { reason?: unknown }).reason as string)
  );
}

type PouleRef = { cpNo: number; phase: number; poule: number };

function isValidPouleRef(body: Record<string, unknown>): body is PouleRef {
  return (
    typeof body.cpNo === "number" &&
    typeof body.phase === "number" &&
    typeof body.poule === "number"
  );
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { teamId, type = "all" } = body as {
    teamId?: string;
    type?: "calendar" | "results" | "all" | "standings" | "poule" | "journees";
  };

  // Vérifier que l'utilisateur a accès à cette équipe (si un teamId est fourni)
  if (teamId) {
    if (!(await isTeamMember(user.id, teamId))) {
      return forbidden();
    }
    // Le teamId n'est utilisé ici que pour le contrôle d'accès : la ressource
    // demandée reste identifiée par le triplet cpNo/phase/poule (modèle
    // compétition), pas par le club de l'équipe.
    const supabase = createAdminClient();
    void supabase; // conservé pour cohérence avec la vérification d'accès ci-dessus
  }

  if (!isValidPouleRef(body)) {
    return NextResponse.json(
      { error: "Triplet de poule requis : cpNo, phase, poule (nombres)" },
      { status: 400 }
    );
  }

  const ref: PouleRef = { cpNo: body.cpNo, phase: body.phase, poule: body.poule };

  try {
    const result: {
      matches?: ParsedDofaMatch[];
      standings?: unknown[];
      journees?: unknown[];
      poule?: unknown;
    } = {};

    if (type === "calendar") {
      result.matches = await fetchPouleCalendrier(ref);
    } else if (type === "results") {
      result.matches = await fetchPouleResultats(ref);
    } else if (type === "all") {
      result.matches = await fetchPouleMatchs(ref);
    }

    if (type === "standings" || type === "all") {
      result.standings = await fetchPouleClassement(ref);
    }

    if (type === "journees") {
      result.journees = await fetchPouleJournees(ref);
    }

    if (type === "poule") {
      result.poule = await fetchPoule(ref);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (isDofaUnavailableError(error)) {
      console.error(`[DOFA] Service indisponible (${error.reason}${error.status ? `, HTTP ${error.status}` : ""}):`, error);
      return NextResponse.json(
        { error: DOFA_UNAVAILABLE_MESSAGE, reason: error.reason, status: error.status },
        { status: 502 }
      );
    }

    console.error("[DOFA] Erreur inattendue:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données DOFA" },
      { status: 502 }
    );
  }
}
