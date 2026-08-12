import { NextResponse } from "next/server";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

interface DOFAMatch {
  idRencontre: string;
  dateMatch: string;
  heureMatch: string;
  libelle: string;
  equipeAccueil: {
    libelle: string;
    score?: number;
  };
  equipeVisiteur: {
    libelle: string;
    score?: number;
  };
  stade?: {
    libelle: string;
  };
}

interface DOFAEquipe {
  libelle: string;
  competition?: {
    libelle: string;
  };
}

interface ParsedMatch {
  date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  location?: string;
}

async function fetchDOFA(endpoint: string, fffNumber: string): Promise<unknown> {
  const url = `https://api-dofa.fff.fr/api/clubs/${fffNumber}${endpoint}`;
  
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Benchrs) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`DOFA HTTP ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error(`[DOFA] Erreur fetch ${endpoint}:`, error);
    throw error;
  }
}

function parseMatches(data: unknown): ParsedMatch[] {
  const matches: ParsedMatch[] = [];
  
  if (!Array.isArray(data)) return matches;

  for (const item of data) {
    const m = item as DOFAMatch;
    
    if (!m.dateMatch || !m.equipeAccueil?.libelle || !m.equipeVisiteur?.libelle) {
      continue;
    }

    // Format: "AAAA-MM-DD"
    const dateStr = m.dateMatch.substring(0, 10);
    
    matches.push({
      date: dateStr,
      home_team: m.equipeAccueil.libelle,
      away_team: m.equipeVisiteur.libelle,
      home_score: m.equipeAccueil.score ?? null,
      away_score: m.equipeVisiteur.score ?? null,
      location: m.stade?.libelle,
    });
  }

  return matches;
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const { teamId, fffNumber, type = "calendar" } = body as {
    teamId?: string;
    fffNumber?: string;
    type?: "calendar" | "results" | "all";
  };

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
      equipes?: string[];
      error?: string;
    } = {};

    if (type === "calendar" || type === "all") {
      try {
        const data = await fetchDOFA("/calendrier", fffNumber);
        result.matches = parseMatches(data);
      } catch (error) {
        console.error("[DOFA] Erreur calendrier:", error);
        result.error = "Impossible de récupérer le calendrier";
      }
    }

    if (type === "results" || type === "all") {
      try {
        const data = await fetchDOFA("/resultat", fffNumber);
        const results = parseMatches(data);
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

    // Récupérer les équipes du club si besoin
    if (!result.equipes) {
      try {
        const data = await fetchDOFA("/equipes.json", fffNumber);
        if (Array.isArray(data)) {
          result.equipes = (data as DOFAEquipe[])
            .map((e) => e.libelle)
            .filter(Boolean);
        }
      } catch (error) {
        console.error("[DOFA] Erreur équipes:", error);
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données DOFA" },
      { status: 502 }
    );
  }
}
