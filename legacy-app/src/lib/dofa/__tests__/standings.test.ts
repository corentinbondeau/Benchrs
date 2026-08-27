/**
 * Tests — computeStandings() / resolveStandings() (src/lib/dofa/standings.ts)
 *
 * Contexte (décision A, cf. TODO §4 point A2) :
 *   Le classement doit pouvoir être calculé localement à partir des
 *   résultats de matchs (3 pts victoire / 1 pt nul / 0 pt défaite), pour
 *   couvrir le cas où le classement officiel FFF (`classement_journees`)
 *   n'est pas encore disponible (saison qui débute : enveloppe Hydra à
 *   0 élément). `resolveStandings` bascule automatiquement entre les deux
 *   sources et EXPOSE la source retenue (`source: "official" | "computed"`)
 *   pour que l'UI puisse afficher un badge au coach.
 *
 * Barème forfait retenu (proposition par défaut du TODO, point A2 à
 * confirmer par le métier) :
 *   - Défaite 0 pt pour l'équipe forfait ;
 *   - Score forfaitaire 0-3 imposé pour le calcul de la différence de buts ;
 *   - PAS de retrait de point supplémentaire ;
 *   - Double forfait : défaite des deux équipes (0 pt chacune), score 0-0
 *     comptabilisé (aucune bonification de buts pour personne).
 *   Ce barème est documenté ici et devra être révisé si le §4 A2 est
 *   tranché différemment par le métier.
 *
 * Phase "Red" attendue : src/lib/dofa/standings.ts n'existe pas encore →
 * tous les tests échouent à l'import.
 *
 * Hors-scope explicite (cf. TODO lot 3) :
 *   - pas de règles de départage FFF exotiques (confrontation directe,
 *     pénalités disciplinaires) ;
 *   - pas de fusion partielle official/computed dans resolveStandings.
 *
 * Signatures attendues (contrat imposé à @dev) :
 *   computeStandings(matches: DofaMatch[]): StandingRow[]
 *   parseOfficialStandings(data: unknown): StandingRow[]
 *   resolveStandings(official: unknown, matches: DofaMatch[]): {
 *     rows: StandingRow[];
 *     source: "official" | "computed";
 *   }
 *
 * Forme attendue d'un StandingRow (contrat minimal exercé par ces tests) :
 *   {
 *     clNo: number,
 *     number: number,
 *     shortName: string,
 *     played: number,
 *     won: number,
 *     drawn: number,
 *     lost: number,
 *     goalsFor: number,
 *     goalsAgainst: number,
 *     goalDifference: number,
 *     points: number,
 *   }
 */

import { describe, it, expect } from "vitest";
import fixtureRaw from "@/lib/dofa/__fixtures__/resultat-d4-pouleD.json";
import { parseDofaMatches } from "@/lib/dofa/parse-matches";
import {
  computeStandings,
  parseOfficialStandings,
  resolveStandings,
} from "@/lib/dofa/standings";

function cloneFixture(): unknown[] {
  return JSON.parse(JSON.stringify(fixtureRaw));
}

// Jeu de matchs synthétique joués, pour tester le calcul de points/tri.
// A (cl_no:1, n:1) bat B (cl_no:2, n:1) 3-1
// B (cl_no:2, n:1) et C (cl_no:3, n:1) font match nul 2-2
// C (cl_no:3, n:1) bat A (cl_no:1, n:1) 1-0
function buildSyntheticPlayedMatches() {
  const base = cloneFixture()[0] as Record<string, unknown>;
  const teamA = { club: { cl_no: 1, logo: "" }, number: 1, short_name: "EQUIPE A" };
  const teamB = { club: { cl_no: 2, logo: "" }, number: 1, short_name: "EQUIPE B" };
  const teamC = { club: { cl_no: 3, logo: "" }, number: 1, short_name: "EQUIPE C" };

  const raw = [
    { ...base, ma_no: 80001, home: teamA, away: teamB, home_score: 3, away_score: 1 },
    { ...base, ma_no: 80002, home: teamB, away: teamC, home_score: 2, away_score: 2 },
    { ...base, ma_no: 80003, home: teamC, away: teamA, home_score: 1, away_score: 0 },
  ];
  return parseDofaMatches(raw);
}

describe("computeStandings — nominal critique (3 pts victoire / 1 nul / 0 défaite)", () => {
  it("calcule points, played, won, drawn, lost, goalsFor/Against, goalDifference sur des matchs joués", () => {
    const matches = buildSyntheticPlayedMatches();
    const rows = computeStandings(matches);

    const a = rows.find((r) => r.clNo === 1 && r.number === 1)!;
    const b = rows.find((r) => r.clNo === 2 && r.number === 1)!;
    const c = rows.find((r) => r.clNo === 3 && r.number === 1)!;

    // A : victoire 3-1 (vs B), défaite 0-1 (vs C) → 1V 0N 1D, 3+0=3 pts
    // buts pour  = 3 + 0 = 3 · buts contre = 1 + 1 = 2 · différence = +1
    expect(a).toEqual(
      expect.objectContaining({
        played: 2,
        won: 1,
        drawn: 0,
        lost: 1,
        goalsFor: 3,
        goalsAgainst: 2,
        goalDifference: 1,
        points: 3,
      })
    );

    // B : défaite 1-3 (vs A), nul 2-2 (vs C) → 0V 1N 1D, 0+1=1 pt
    expect(b).toEqual(
      expect.objectContaining({
        played: 2,
        won: 0,
        drawn: 1,
        lost: 1,
        goalsFor: 3,
        goalsAgainst: 5,
        goalDifference: -2,
        points: 1,
      })
    );

    // C : nul 2-2 (vs B), victoire 1-0 (vs A) → 1V 1N 0D, 3+1=4 pts
    expect(c).toEqual(
      expect.objectContaining({
        played: 2,
        won: 1,
        drawn: 1,
        lost: 0,
        goalsFor: 3,
        goalsAgainst: 2,
        goalDifference: 1,
        points: 4,
      })
    );
  });

  it("les matchs non joués (score null) sont IGNORÉS du calcul, jamais comptés comme un nul 0-0", () => {
    const matches = parseDofaMatches(cloneFixture()); // 3 matchs, tous scores null
    const rows = computeStandings(matches);
    // les 6 équipes engagées doivent apparaître (cas limite réel de la
    // fixture : saison non commencée) mais aucune n'a de match "joué"
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.played, `equipe ${row.clNo}/${row.number}`).toBe(0);
      expect(row.points, `equipe ${row.clNo}/${row.number}`).toBe(0);
      expect(row.won).toBe(0);
      expect(row.drawn).toBe(0);
      expect(row.lost).toBe(0);
    }
  });
});

describe("computeStandings — tri (points DESC, puis différence de buts, puis buts marqués), stable et déterministe", () => {
  it("trie C (4 pts) > A (3 pts) > B (1 pt)", () => {
    const matches = buildSyntheticPlayedMatches();
    const rows = computeStandings(matches);
    expect(rows.map((r) => `${r.clNo}/${r.number}`)).toEqual([
      "3/1", // C, 4 pts
      "1/1", // A, 3 pts
      "2/1", // B, 1 pt
    ]);
  });

  it("départage par différence de buts à points égaux", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const teamX = { club: { cl_no: 10, logo: "" }, number: 1, short_name: "X" };
    const teamY = { club: { cl_no: 11, logo: "" }, number: 1, short_name: "Y" };
    const teamZ = { club: { cl_no: 12, logo: "" }, number: 1, short_name: "Z" };
    const teamW = { club: { cl_no: 13, logo: "" }, number: 1, short_name: "W" };
    // X gagne 5-0 (diff +5), Z gagne 1-0 (diff +1) → X et Z ont 3 pts chacun
    const raw = [
      { ...base, ma_no: 81001, home: teamX, away: teamY, home_score: 5, away_score: 0 },
      { ...base, ma_no: 81002, home: teamZ, away: teamW, home_score: 1, away_score: 0 },
    ];
    const matches = parseDofaMatches(raw);
    const rows = computeStandings(matches);
    const x = rows.findIndex((r) => r.clNo === 10);
    const z = rows.findIndex((r) => r.clNo === 12);
    expect(x).toBeLessThan(z); // X (diff +5) passe avant Z (diff +1)
  });

  it("départage stable et déterministe à points ET différence de buts identiques (ordre d'entrée préservé)", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const teamX = { club: { cl_no: 20, logo: "" }, number: 1, short_name: "X" };
    const teamY = { club: { cl_no: 21, logo: "" }, number: 1, short_name: "Y" };
    const teamZ = { club: { cl_no: 22, logo: "" }, number: 1, short_name: "Z" };
    const teamW = { club: { cl_no: 23, logo: "" }, number: 1, short_name: "W" };
    // X et Z : victoire 2-0 chacune → points et diff de buts strictement identiques
    const raw = [
      { ...base, ma_no: 82001, home: teamX, away: teamY, home_score: 2, away_score: 0 },
      { ...base, ma_no: 82002, home: teamZ, away: teamW, home_score: 2, away_score: 0 },
    ];
    const matches = parseDofaMatches(raw);
    const runs = [computeStandings(matches), computeStandings(matches)].map((rows) =>
      rows.map((r) => `${r.clNo}/${r.number}`)
    );
    // deux exécutions successives sur les mêmes données → même ordre
    // (non-flaky), et l'ordre d'entrée est respecté en cas d'égalité totale.
    // Les 4 équipes ont joué : les 2 vainqueurs (3 pts, +2) devancent les
    // 2 perdants (0 pt, -2), chaque groupe restant dans l'ordre d'entrée.
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[0]).toEqual(["20/1", "22/1", "21/1", "23/1"]);
  });
});

describe("computeStandings — clé d'agrégation cl_no + number (jamais short_name seul)", () => {
  it("deux équipes homonymes (même short_name) de clubs différents ne sont pas fusionnées", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const homonyme1 = { club: { cl_no: 100, logo: "" }, number: 1, short_name: "FC PHENIX" };
    const homonyme2 = { club: { cl_no: 200, logo: "" }, number: 1, short_name: "FC PHENIX" };
    const adversaire = { club: { cl_no: 999, logo: "" }, number: 1, short_name: "ADVERSAIRE" };
    const raw = [
      { ...base, ma_no: 83001, home: homonyme1, away: adversaire, home_score: 1, away_score: 0 },
      { ...base, ma_no: 83002, home: homonyme2, away: adversaire, home_score: 2, away_score: 0 },
    ];
    const matches = parseDofaMatches(raw);
    const rows = computeStandings(matches);
    const phenix1 = rows.find((r) => r.clNo === 100)!;
    const phenix2 = rows.find((r) => r.clNo === 200)!;
    expect(phenix1).not.toEqual(phenix2);
    expect(phenix1.points).toBe(3);
    expect(phenix2.points).toBe(3);
    expect(phenix1.goalsFor).toBe(1);
    expect(phenix2.goalsFor).toBe(2);
  });
});

describe("computeStandings — forfaits (barème documenté : défaite 0 pt, score forfaitaire 0-3, sans retrait de point)", () => {
  it('forfait simple ("O" pour une équipe) → défaite pour le forfait, victoire 3-0 pour l\'adversaire', () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const teamForfait = { club: { cl_no: 30, logo: "" }, number: 1, short_name: "FORFAIT" };
    const teamAdverse = { club: { cl_no: 31, logo: "" }, number: 1, short_name: "ADVERSAIRE" };
    const raw = [
      {
        ...base,
        ma_no: 84001,
        home: teamForfait,
        away: teamAdverse,
        home_is_forfeit: "O",
        away_is_forfeit: "N",
        home_score: null,
        away_score: null,
      },
    ];
    const matches = parseDofaMatches(raw);
    const rows = computeStandings(matches);
    const forfait = rows.find((r) => r.clNo === 30)!;
    const adverse = rows.find((r) => r.clNo === 31)!;
    expect(forfait).toEqual(
      expect.objectContaining({ played: 1, won: 0, drawn: 0, lost: 1, points: 0 })
    );
    expect(adverse).toEqual(
      expect.objectContaining({ played: 1, won: 1, drawn: 0, lost: 0, points: 3 })
    );
    // score forfaitaire 0-3 imposé (barème documenté ci-dessus)
    expect(forfait.goalsAgainst).toBe(3);
    expect(adverse.goalsFor).toBe(3);
  });

  it("double forfait → défaite des deux équipes, aucune bonification de buts", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const teamA = { club: { cl_no: 40, logo: "" }, number: 1, short_name: "A" };
    const teamB = { club: { cl_no: 41, logo: "" }, number: 1, short_name: "B" };
    const raw = [
      {
        ...base,
        ma_no: 85001,
        home: teamA,
        away: teamB,
        home_is_forfeit: "O",
        away_is_forfeit: "O",
        home_score: null,
        away_score: null,
      },
    ];
    const matches = parseDofaMatches(raw);
    const rows = computeStandings(matches);
    const a = rows.find((r) => r.clNo === 40)!;
    const b = rows.find((r) => r.clNo === 41)!;
    expect(a.points).toBe(0);
    expect(b.points).toBe(0);
    expect(a.won).toBe(0);
    expect(b.won).toBe(0);
    expect(a.goalsFor).toBe(0);
    expect(b.goalsFor).toBe(0);
  });
});

describe("computeStandings — cas limites", () => {
  it("aucun match joué → toutes les équipes engagées apparaissent à 0 (pas de tableau vide, cf. cas fixture réelle)", () => {
    const matches = parseDofaMatches(cloneFixture());
    const rows = computeStandings(matches);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.points === 0)).toBe(true);
  });

  it("une seule équipe engagée (aucun match) → une ligne à 0", () => {
    // Cas synthétique minimal : un seul match dont une des deux équipes
    // n'a par ailleurs aucune autre apparition — on vérifie simplement
    // que computeStandings ne plante pas sur un jeu réduit à une équipe
    // sans confrontation jouée.
    const base = cloneFixture()[0] as Record<string, unknown>;
    const solo = { club: { cl_no: 50, logo: "" }, number: 1, short_name: "SOLO" };
    const rival = { club: { cl_no: 51, logo: "" }, number: 1, short_name: "RIVAL" };
    const raw = [
      { ...base, ma_no: 86001, home: solo, away: rival, home_score: null, away_score: null },
    ];
    const matches = parseDofaMatches(raw);
    const rows = computeStandings(matches);
    const soloRow = rows.find((r) => r.clNo === 50)!;
    expect(soloRow.played).toBe(0);
    expect(soloRow.points).toBe(0);
  });

  it("égalité parfaite entre deux équipes (points, diff, buts marqués identiques) → ordre stable non-flaky", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const teamP = { club: { cl_no: 60, logo: "" }, number: 1, short_name: "P" };
    const teamQ = { club: { cl_no: 61, logo: "" }, number: 1, short_name: "Q" };
    const teamR = { club: { cl_no: 62, logo: "" }, number: 1, short_name: "R" };
    const teamS = { club: { cl_no: 63, logo: "" }, number: 1, short_name: "S" };
    const raw = [
      { ...base, ma_no: 87001, home: teamP, away: teamQ, home_score: 1, away_score: 1 },
      { ...base, ma_no: 87002, home: teamR, away: teamS, home_score: 1, away_score: 1 },
    ];
    const matches = parseDofaMatches(raw);
    const rows1 = computeStandings(matches).map((r) => r.clNo);
    const rows2 = computeStandings(matches).map((r) => r.clNo);
    expect(rows1).toEqual(rows2);
  });
});

describe("resolveStandings — bascule officiel/calculé avec source exposée", () => {
  it("classement officiel non vide → retourné tel quel, source: 'official'", () => {
    const officialRaw = {
      "hydra:member": [
        {
          club: { cl_no: 999, number: 1 },
          short_name: "OFFICIEL",
          played: 5,
          won: 4,
          drawn: 1,
          lost: 0,
          points: 13,
          goals_for: 10,
          goals_against: 2,
        },
      ],
      "hydra:totalItems": 1,
    };
    const matches = parseDofaMatches(cloneFixture());
    const result = resolveStandings(officialRaw, matches);
    expect(result.source).toBe("official");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({ clNo: 999, points: 13 })
    );
  });

  it("classement officiel vide (hydra:totalItems: 0, saison non commencée) → repli sur le calculé, source: 'computed'", () => {
    const officialEmpty = { "hydra:member": [], "hydra:totalItems": 0 };
    const matches = parseDofaMatches(cloneFixture());
    const result = resolveStandings(officialEmpty, matches);
    expect(result.source).toBe("computed");
    expect(result.rows).toHaveLength(6);
  });

  it("classement officiel null/undefined → repli sur le calculé, sans throw", () => {
    const matches = parseDofaMatches(cloneFixture());
    expect(() => resolveStandings(null, matches)).not.toThrow();
    expect(resolveStandings(null, matches).source).toBe("computed");
    expect(resolveStandings(undefined, matches).source).toBe("computed");
  });
});

describe("parseOfficialStandings — extraction pure de l'enveloppe Hydra du classement officiel", () => {
  it("extrait les lignes de hydra:member avec la clé cl_no + number", () => {
    const officialRaw = {
      "hydra:member": [
        { club: { cl_no: 1, number: 1 }, short_name: "A", points: 10 },
      ],
      "hydra:totalItems": 1,
    };
    const rows = parseOfficialStandings(officialRaw);
    expect(rows[0]).toEqual(
      expect.objectContaining({ clNo: 1, number: 1, points: 10 })
    );
  });

  it("enveloppe vide ou entrée inattendue → tableau vide sans throw", () => {
    expect(parseOfficialStandings({ "hydra:member": [], "hydra:totalItems": 0 })).toEqual([]);
    expect(() => parseOfficialStandings(null)).not.toThrow();
    expect(parseOfficialStandings(null)).toEqual([]);
  });
});
