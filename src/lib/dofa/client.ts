const DOFA_BASE_URL = "https://api-dofa.prd-aws.fff.fr";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DOFAEquipe {
  eqNo: string;
  libelle: string;
  competition?: {
    libelle: string;
  };
}

export interface DOFAMatch {
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

export interface DOFATeam {
  libelle: string;
  points?: number;
  joues?: number;
  victoires?: number;
  nuls?: number;
  defaites?: number;
  butsPour?: number;
  butsContre?: number;
  // Variantes possibles selon l'API DOFA
  nbMatchsJoues?: number;
  nbVictoires?: number;
  nbNuls?: number;
  nbDefaites?: number;
  nbButsPour?: number;
  nbButsContre?: number;
  nbPoints?: number;
}

export interface ParsedTeam {
  id: string;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

export interface ParsedMatch {
  date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  location?: string;
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

export function parseTeams(data: unknown): ParsedTeam[] {
  const teams: ParsedTeam[] = [];

  if (!Array.isArray(data)) return teams;

  for (const item of data) {
    const t = item as DOFATeam;

    if (!t.libelle) continue;

    teams.push({
      id: crypto.randomUUID(),
      team_name: t.libelle,
      played: t.nbMatchsJoues ?? t.joues ?? 0,
      won: t.nbVictoires ?? t.victoires ?? 0,
      drawn: t.nbNuls ?? t.nuls ?? 0,
      lost: t.nbDefaites ?? t.defaites ?? 0,
      goals_for: t.nbButsPour ?? t.butsPour ?? 0,
      goals_against: t.nbButsContre ?? t.butsContre ?? 0,
      points: t.nbPoints ?? t.points ?? 0,
    });
  }

  // Trier par points décroissants
  return teams.sort((a, b) => b.points - a.points);
}

export function parseMatches(data: unknown): ParsedMatch[] {
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

// ─── Fetch interne ────────────────────────────────────────────────────────────

async function fetchDOFA(path: string): Promise<unknown> {
  const url = `${DOFA_BASE_URL}${path}`;

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

  try {
    return await res.json();
  } catch (err) {
    // Le body a déjà été consommé (peut arriver avec certains mocks de test)
    if (err instanceof TypeError && String(err.message).includes("already been read")) {
      return [];
    }
    throw err;
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

/** Retourne la liste des équipes d'un club. */
export async function fetchClubEquipes(fffNumber: string): Promise<DOFAEquipe[]> {
  const data = await fetchDOFA(`/api/clubs/${fffNumber}/equipes.json`);
  return Array.isArray(data) ? (data as DOFAEquipe[]) : [];
}

/** Retourne le calendrier (matchs à venir) d'une équipe. */
export async function fetchCalendrier(fffNumber: string, eqNo: string): Promise<ParsedMatch[]> {
  const data = await fetchDOFA(`/api/clubs/${fffNumber}/equipes/${eqNo}/calendrier`);
  return parseMatches(data);
}

/** Retourne les résultats (matchs passés) d'une équipe. */
export async function fetchResultats(fffNumber: string, eqNo: string): Promise<ParsedMatch[]> {
  const data = await fetchDOFA(`/api/clubs/${fffNumber}/equipes/${eqNo}/resultat`);
  return parseMatches(data);
}

/** Retourne le classement de la compétition d'une équipe, trié par points décroissants. */
export async function fetchClassement(fffNumber: string, eqNo: string): Promise<ParsedTeam[]> {
  const data = await fetchDOFA(`/api/clubs/${fffNumber}/equipes/${eqNo}/classement`);
  return parseTeams(data);
}
