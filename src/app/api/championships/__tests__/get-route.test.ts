/**
 * Tests — Contrat de GET /api/championships (champ standings_coverage)
 *
 * Ce fichier verrouille l'exposition du champ `standings_coverage` dans la
 * réponse du GET /api/championships. Ce champ calcule si les matchs en base
 * couvrent l'ensemble du round-robin attendu ("full") ou seulement une
 * partie ("partial").
 *
 * Contrat verrouillé ici :
 *   1. SENTINELLE : `standings_coverage` est TOUJOURS présent dans chaque
 *      objet championnat retourné — empêche les régressions silencieuses
 *      après refactor (champ absent → UI affiche "undefined").
 *   2. Matchs n'impliquant qu'une seule équipe → `standings_coverage: "partial"`.
 *   3. Round-robin complet (4 équipes, 6 paires) → `standings_coverage: "full"`.
 *   4. Aucun match en base → `standings_coverage: "partial"`.
 *
 * Hors-scope explicite :
 *   - Auth (401/403) : couverts dans les autres fichiers de test du dossier.
 *   - Logique interne de `isPartialCoverage` : couverte par les tests unitaires
 *     de `src/lib/dofa/standings.ts`.
 *   - Rendu UI : hors-scope TDD backend.
 *   - `standings_source: "computed"` : champ pré-existant, non modifié par cette US.
 *
 * Stratégie de mock : alignée sur patch-route.test.ts / ingest-route.test.ts.
 * `@/lib/api-auth` et `@/lib/supabase/admin` mockés ; état contrôlable par test.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock : @/lib/api-auth
// ---------------------------------------------------------------------------
vi.mock("@/lib/api-auth", () => ({
  getAuthUser: vi.fn(),
  unauthorized: vi.fn(
    () =>
      new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
  ),
  forbidden: vi.fn(
    () =>
      new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
  ),
  isTeamMember: vi.fn(),
  isTeamCoach: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock : @/lib/supabase/admin — état contrôlable par test
// ---------------------------------------------------------------------------

/**
 * Ligne championship_standings minimale pour toDofaMatchForStandings.
 * Seuls les champs lus par la fonction sont présents :
 *   - home_cl_no / home_team_number / home_team (identité domicile)
 *   - away_cl_no / away_team_number / away_team (identité extérieur)
 *   - home_score / away_score / home_is_forfeit / away_is_forfeit (résultat)
 * Les autres champs (dofa_ma_no, matchday_number, kickoff, postponed) sont
 * neutres et jamais lus par computeStandings.
 */
interface StandingsRow {
  home_cl_no: number;
  home_team_number: number;
  home_team: string;
  away_cl_no: number;
  away_team_number: number;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  home_is_forfeit: boolean;
  away_is_forfeit: boolean;
}

interface SupabaseMockState {
  championships: Array<{ id: string; team_id: string; name: string; created_at: string; official_standings?: unknown }>;
  standingsRows: StandingsRow[];
}

let mockState: SupabaseMockState;

function resetSupabaseMockState() {
  mockState = {
    championships: [
      { id: "champ-1", team_id: "team-1", name: "D4 Poule D", created_at: "2024-01-01T00:00:00Z" },
    ],
    standingsRows: [],
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "championships") {
        return {
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({ data: mockState.championships, error: null }),
            }),
          }),
        };
      }

      if (table === "championship_standings") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({ data: mockState.standingsRows, error: null }),
          }),
        };
      }

      throw new Error(`Table non mockée dans ce test GET : ${table}`);
    },
  })),
}));

import { getAuthUser, isTeamMember } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthedUser() {
  return { id: "user-1" } as never;
}

function makeGetRequest(teamId = "team-1"): Request {
  return new Request(`http://localhost/api/championships?team_id=${teamId}`, {
    method: "GET",
    headers: { authorization: "Bearer test-token" },
  });
}

/** Produit un match entre deux équipes identifiées par leur clNo/number. */
function makeMatch(
  homeClNo: number,
  homeNumber: number,
  awayClNo: number,
  awayNumber: number,
  homeScore: number | null = 1,
  awayScore: number | null = 0
): StandingsRow {
  return {
    home_cl_no: homeClNo,
    home_team_number: homeNumber,
    home_team: `Équipe ${homeClNo}/${homeNumber}`,
    away_cl_no: awayClNo,
    away_team_number: awayNumber,
    away_team: `Équipe ${awayClNo}/${awayNumber}`,
    home_score: homeScore,
    away_score: awayScore,
    home_is_forfeit: false,
    away_is_forfeit: false,
  };
}

/**
 * Génère toutes les paires (round-robin complet) pour N équipes.
 * Chaque équipe est identifiée par (clNo=1, number=i).
 */
function makeRoundRobinMatches(teamCount: number): StandingsRow[] {
  const rows: StandingsRow[] = [];
  for (let i = 1; i <= teamCount; i++) {
    for (let j = i + 1; j <= teamCount; j++) {
      rows.push(makeMatch(1, i, 1, j, 1, 0));
    }
  }
  return rows;
}

async function importRoute() {
  return import("@/app/api/championships/route");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  resetSupabaseMockState();

  // Auth valide par défaut : utilisateur authentifié et membre de l'équipe.
  vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
  vi.mocked(isTeamMember).mockResolvedValue(true);
});

// ---------------------------------------------------------------------------
// describe : standings_coverage
// ---------------------------------------------------------------------------

describe("GET /api/championships — standings_coverage", () => {
  it("SENTINELLE: standings_coverage est TOUJOURS present dans la reponse JSON", async () => {
    // Bug empêché : après un refactor de la route (ex: déstructuration,
    // renommage de variable, ajout d'une nouvelle couche de mapping), le champ
    // pourrait disparaître silencieusement. L'UI afficherait alors "undefined"
    // ou un badge absent sans aucune erreur côté serveur.

    // Quelques matchs valides (cas nominal simple : 2 équipes, 1 match).
    mockState.standingsRows = [makeMatch(10, 1, 10, 2)];

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());
    const body = await res.json() as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(
      body[0].standings_coverage,
      "standings_coverage doit être défini (jamais undefined) dans chaque objet championnat"
    ).toBeDefined();
    expect(["full", "partial"]).toContain(body[0].standings_coverage);
  });

  it("matchs d'une seule equipe → standings_coverage = partial", async () => {
    // Bug empêché : si la route retournait toujours "full" (valeur par défaut
    // incorrecte), ou omettait d'appeler isPartialCoverage, un classement avec
    // des données incomplètes serait présenté comme fiable au coach.
    //
    // Scénario : toutes les lignes impliquent la même équipe (1/1) — soit
    // comme équipe domicile, soit comme équipe extérieure. Il n'y a qu'un seul
    // adversaire distinct → couverture incomplète.

    mockState.standingsRows = [
      makeMatch(1, 1, 1, 2), // équipe 1/1 joue contre 1/2
      makeMatch(1, 1, 1, 3), // équipe 1/1 joue contre 1/3
      // Équipes 1/2 et 1/3 ne se sont JAMAIS affrontées → partiel
    ];

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());
    const body = await res.json() as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(body[0].standings_coverage).toBe("partial");
  });

  it("round-robin complet → standings_coverage = full", async () => {
    // Bug empêché : si la route retournait toujours "partial" (prudence
    // excessive ou bug de calcul), le badge de l'UI signalerait toujours
    // un classement incomplet même quand toutes les confrontations ont eu lieu,
    // induisant le coach en erreur.
    //
    // Scénario : 4 équipes, 6 paires (4*3/2) — round-robin complet.

    mockState.standingsRows = makeRoundRobinMatches(4); // 6 paires

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());
    const body = await res.json() as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(body[0].standings_coverage).toBe("full");
  });

  it("aucun match en base → standings_coverage = partial", async () => {
    // Bug empêché : si la route calculait standings_coverage sur un tableau vide
    // sans passer par isPartialCoverage (ex: `rows.length === 0 ? "full" : ...`),
    // un championnat sans aucun match importé afficherait un classement "complet"
    // — l'UI ne montrerait aucune alerte au coach alors que la base est vide.

    mockState.standingsRows = []; // aucun match importé

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());
    const body = await res.json() as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(body[0].standings_coverage).toBe("partial");
  });
});

// ---------------------------------------------------------------------------
// describe : GET — resolveStandings (branchement official_standings)
// ---------------------------------------------------------------------------

/**
 * Fixture minimale de classement officiel FFF (enveloppe Hydra).
 * Un seul item suffit pour que parseOfficialStandings retourne un tableau
 * non vide et que resolveStandings bascule sur la source "official".
 */
const OFFICIAL_STANDINGS_FIXTURE = {
  "hydra:member": [
    {
      club: { cl_no: 100, number: 1 },
      short_name: "Equipe A",
      played: 3,
      won: 2,
      drawn: 1,
      lost: 0,
      goals_for: 5,
      goals_against: 2,
      points: 7,
    },
  ],
};

describe("GET /api/championships — resolveStandings", () => {
  it("quand official_standings est non null, standings_source vaut 'official'", async () => {
    // Bug empêché : le GET ignore official_standings stocké en base et retourne
    // toujours standings_source: "computed" (comportement actuel avec computeStandings
    // hardcodé). Le coach voit un classement calculé localement alors que le
    // classement officiel FFF est disponible.

    mockState.championships = [
      {
        id: "champ-1",
        team_id: "team-1",
        name: "D4 Poule D",
        created_at: "2024-01-01T00:00:00Z",
        official_standings: OFFICIAL_STANDINGS_FIXTURE,
      },
    ];
    mockState.standingsRows = [makeMatch(10, 1, 10, 2)];

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());
    const body = await res.json() as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(
      body[0].standings_source,
      "standings_source doit valoir 'official' quand official_standings est non null en base"
    ).toBe("official");
  });

  it("quand official_standings est null, repli sur computed", async () => {
    // Bug empêché : régression du repli — si resolveStandings n'est pas appelé
    // correctement (ou si official_standings null provoque une exception),
    // le classement calculé à partir des championship_standings disparaîtrait.

    mockState.championships = [
      {
        id: "champ-1",
        team_id: "team-1",
        name: "D4 Poule D",
        created_at: "2024-01-01T00:00:00Z",
        official_standings: null,
      },
    ];
    // Des matchs en base pour que computeStandings produise un résultat non vide.
    mockState.standingsRows = makeRoundRobinMatches(3);

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());
    const body = await res.json() as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(
      body[0].standings_source,
      "standings_source doit valoir 'computed' quand official_standings est null"
    ).toBe("computed");
  });

  it("quand standings_source est 'official', standings_coverage vaut toujours 'full'", async () => {
    // Bug empêché : le classement officiel FFF est complet par définition
    // (la FFF ne publie pas de classement partiel). Si la route continuait à
    // appeler isPartialCoverage sur les matchs locaux même quand la source est
    // "official", elle pourrait retourner standings_coverage: "partial" alors
    // que le classement présenté est le classement officiel — induisant le coach
    // en erreur (badge "incomplet" affiché sur un classement FFF fiable).

    mockState.championships = [
      {
        id: "champ-1",
        team_id: "team-1",
        name: "D4 Poule D",
        created_at: "2024-01-01T00:00:00Z",
        official_standings: OFFICIAL_STANDINGS_FIXTURE,
      },
    ];
    // Matchs locaux intentionnellement partiels : si la route se trompait de
    // source pour standings_coverage, ce setup provoquerait "partial".
    mockState.standingsRows = [makeMatch(10, 1, 10, 2)];

    const { GET } = await importRoute();
    const res = await GET(makeGetRequest());
    const body = await res.json() as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(body[0].standings_source).toBe("official");
    expect(
      body[0].standings_coverage,
      "standings_coverage doit être 'full' quand la source est 'official' (classement FFF toujours complet)"
    ).toBe("full");
  });
});
