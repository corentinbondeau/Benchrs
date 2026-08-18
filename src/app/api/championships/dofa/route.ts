import { NextResponse } from "next/server";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchClubEquipes,
  fetchCalendrier,
  fetchResultats,
  fetchClassement,
} from "@/lib/dofa";
import type { ParsedMatch, ParsedTeam } from "@/lib/dofa";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { teamId, type = "calendar", eqNo, clubName } = body as {
    teamId?: string;
    fffNumber?: string;
    clubName?: string;
    eqNo?: string;
    type?: "calendar" | "results" | "all" | "equipes" | "standings";
  };
  let { fffNumber } = body as { fffNumber?: string };

  // Vérifier que l'utilisateur a accès à cette équipe
  if (teamId) {
    if (!(await isTeamMember(user.id, teamId))) {
      return forbidden();
    }

    // Récupérer le numéro FFF de l'équipe si non fourni
    if (!fffNumber) {
      const supabase = createAdminClient();
      const { data: team } = await supabase
        .from("teams")
        .select("id, club:clubs(id, fff_number)")
        .eq("id", teamId)
        .maybeSingle();

      if (!team?.club) {
        return NextResponse.json(
          { error: "Club non trouvé" },
          { status: 400 }
        );
      }

      const foundFffNumber = (team.club as { fff_number?: string }).fff_number;
      if (!foundFffNumber) {
        return NextResponse.json(
          { error: "Numéro FFF du club non disponible" },
          { status: 400 }
        );
      }
      fffNumber = foundFffNumber;
    }
  }

  if (!fffNumber) {
    return NextResponse.json(
      { error: "Numéro FFF requis" },
      { status: 400 }
    );
  }

  try {
    const result: {
      matches?: ParsedMatch[];
      standings?: ParsedTeam[];
      equipes?: { eqNo: string; libelle: string }[];
      error?: string;
    } = {};

    if (type === "calendar" || type === "all") {
      try {
        result.matches = await fetchCalendrier(fffNumber, eqNo ?? "");
      } catch (error) {
        console.error("[DOFA] Erreur calendrier:", error);
        result.error = "Impossible de récupérer le calendrier";
      }
    }

    if (type === "results" || type === "all") {
      try {
        const results = await fetchResultats(fffNumber, eqNo ?? "");
        // Fusionner avec les matchs existants
        if (result.matches) {
          result.matches = [...result.matches, ...results].filter(
            (m, i, arr) =>
              arr.findIndex(
                (x) =>
                  x.date === m.date &&
                  x.home_team === m.home_team &&
                  x.away_team === m.away_team
              ) === i
          );
        } else {
          result.matches = results;
        }
      } catch (error) {
        console.error("[DOFA] Erreur résultats:", error);
      }
    }

    if (type === "standings" && eqNo) {
      try {
        result.standings = await fetchClassement(fffNumber, eqNo);
      } catch (error) {
        console.error("[DOFA] Erreur classement:", error);
      }
    }

    // Récupérer les équipes du club (classement + noms)
    try {
      const equipes = await fetchClubEquipes(fffNumber);
      if (equipes.length > 0) {
        result.equipes = equipes
          .filter((e) => e.eqNo && e.libelle)
          .map((e) => ({ eqNo: e.eqNo, libelle: e.libelle }));
      }
    } catch (error) {
      console.error("[DOFA] Erreur équipes:", error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données DOFA" },
      { status: 502 }
    );
  }
}
