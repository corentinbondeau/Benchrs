/**
 * Tests — `extractPouleTeams` (fonction PURE)
 *
 * Contexte (US import-championnat, correctif « agenda vide ») : le coach
 * doit pouvoir choisir son équipe dans la liste des équipes de la poule,
 * reconstituée à partir des matchs qu'il vient de coller. Cette liste
 * alimente ensuite le `PATCH /api/championships` qui persiste
 * `dofa_cl_no` / `dofa_team_number` — l'identité sans laquelle
 * `planEventSync` ne reconnaît aucun match (cf. correctif précédent).
 *
 * Contrat verrouillé ici :
 *   - `extractPouleTeams(matches: DofaMatch[]): PouleTeam[]`
 *   - `PouleTeam = { clNo: number; number: number; shortName: string }`
 *     (mêmes champs que `DofaMatchTeam`, cf. `parse-matches.ts` — jamais
 *     `short_name` seul comme identité, cause n°… du bug « Match vs
 *     CAMPHIN PEVELE ECF »).
 *   - une équipe (clNo + number) apparaissant plusieurs fois dans les
 *     matchs (domicile puis extérieur, ou plusieurs matchs) n'apparaît
 *     qu'UNE FOIS dans le résultat.
 *   - 🔒 deux équipes du MÊME club (même `clNo`) mais de `number`
 *     différent sont deux équipes DISTINCTES — la déduplication doit se
 *     faire sur le couple (clNo, number), jamais sur `clNo` seul ni sur
 *     `shortName` seul.
 *   - tri alphabétique sur `shortName` (ordre stable et prévisible pour
 *     que le coach retrouve facilement son équipe dans une liste
 *     déroulante), avec `clNo` puis `number` en tie-break déterministe si
 *     deux équipes partagent exactement le même `shortName`.
 *   - robustesse : tableau vide → liste vide (sans exception) ; un match
 *     dont une équipe est incomplète ne doit produire aucune entrée
 *     fantôme (mais `DofaMatch` est déjà une forme parsée/validée par
 *     `parseDofaMatches`, donc homeTeam/awayTeam y sont toujours définis
 *     — le cas « incomplet » est simulé ici via un objet partiel forcé en
 *     entrée, pour verrouiller la robustesse même en cas d'appel avec des
 *     données non strictement typées, ex. JSON.parse d'un payload legacy).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractPouleTeams } from "../poule-teams";
import { parseDofaMatches } from "../parse-matches";
import type { DofaMatch } from "../parse-matches";

function loadFixtureMatches(): DofaMatch[] {
  const fixturePath = path.join(
    __dirname,
    "../__fixtures__/resultat-d4-pouleD.json"
  );
  const raw = JSON.parse(readFileSync(fixturePath, "utf-8"));
  return parseDofaMatches(raw);
}

function makeMatch(overrides: Partial<DofaMatch> = {}): DofaMatch {
  return {
    maNo: 1,
    matchday: 1,
    kickoff: null,
    date: "2026-09-06T00:00:00+00:00",
    homeTeam: { clNo: 1, number: 1, shortName: "HOME FC" },
    awayTeam: { clNo: 2, number: 1, shortName: "AWAY FC" },
    homeScore: null,
    awayScore: null,
    homeIsForfeit: false,
    awayIsForfeit: false,
    location: null,
    seemsPostponed: false,
    status: null,
    ...overrides,
  };
}

describe("extractPouleTeams — nominal sur la fixture réelle", () => {
  it("retourne les équipes distinctes de la poule, sans doublon, triées par shortName", () => {
    const matches = loadFixtureMatches();
    expect(matches).toHaveLength(3);

    const teams = extractPouleTeams(matches);

    expect(teams).toEqual([
      { clNo: 918, number: 2, shortName: "BOUSBECQUE CS" },
      { clNo: 10428, number: 1, shortName: "CAMPHIN PEVELE ECF" },
      { clNo: 796, number: 10, shortName: "LEERS OS" },
      { clNo: 206181, number: 6, shortName: "PEVELE FC" },
      { clNo: 15478, number: 2, shortName: "TOUFFLERS AF" },
      { clNo: 6956, number: 2, shortName: "WATTIGNIES FC" },
    ]);
  });
});

describe("extractPouleTeams — déduplication d'une équipe jouant domicile puis extérieur", () => {
  it("ne liste qu'une fois une équipe (clNo+number) apparaissant dans plusieurs matchs", () => {
    const clubA = { clNo: 100, number: 1, shortName: "CLUB A" };
    const clubB = { clNo: 200, number: 1, shortName: "CLUB B" };
    const clubC = { clNo: 300, number: 1, shortName: "CLUB C" };

    const matches: DofaMatch[] = [
      makeMatch({ maNo: 1, homeTeam: clubA, awayTeam: clubB }),
      // Club A rejoue, cette fois à l'extérieur : ne doit pas créer une
      // seconde entrée.
      makeMatch({ maNo: 2, homeTeam: clubC, awayTeam: clubA }),
    ];

    const teams = extractPouleTeams(matches);

    expect(teams).toHaveLength(3);
    expect(teams.filter((t) => t.clNo === 100 && t.number === 1)).toHaveLength(1);
  });
});

describe("extractPouleTeams — 🔒 deux équipes du même club, numéros différents", () => {
  it("liste séparément deux équipes partageant le même clNo mais un number distinct", () => {
    // Reproduit le piège « Match vs CAMPHIN PEVELE ECF » sous une autre
    // forme : un même club peut engager plusieurs équipes (ex. équipe 1
    // et équipe 2) dans des poules différentes ou la même saison — elles
    // ne doivent JAMAIS être fusionnées en une seule entrée.
    const teamOne = { clNo: 10428, number: 1, shortName: "CAMPHIN PEVELE ECF" };
    const teamTwo = { clNo: 10428, number: 2, shortName: "CAMPHIN PEVELE ECF 2" };
    const opponent = { clNo: 500, number: 1, shortName: "AUTRE CLUB" };

    const matches: DofaMatch[] = [
      makeMatch({ maNo: 1, homeTeam: teamOne, awayTeam: opponent }),
      makeMatch({ maNo: 2, homeTeam: teamTwo, awayTeam: opponent }),
    ];

    const teams = extractPouleTeams(matches);

    expect(teams).toContainEqual(teamOne);
    expect(teams).toContainEqual(teamTwo);
    expect(teams).toHaveLength(3);
  });
});

describe("extractPouleTeams — robustesse", () => {
  it("retourne une liste vide pour un tableau vide, sans exception", () => {
    expect(extractPouleTeams([])).toEqual([]);
  });

  it("ignore un match dont une équipe est incomplète, sans produire d'entrée fantôme", () => {
    const validOpponent = { clNo: 42, number: 1, shortName: "VALID FC" };
    const incompleteTeam = { clNo: 1, shortName: "INCOMPLET" } as unknown as DofaMatch["homeTeam"];

    const matches: DofaMatch[] = [
      makeMatch({ maNo: 1, homeTeam: incompleteTeam, awayTeam: validOpponent }),
    ];

    const teams = extractPouleTeams(matches);

    expect(teams).toEqual([validOpponent]);
  });
});
