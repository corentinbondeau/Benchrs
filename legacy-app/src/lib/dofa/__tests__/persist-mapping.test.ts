/**
 * Tests — buildChampionshipUpsert() / buildMatchUpserts() (src/lib/dofa/persist-mapping.ts)
 *
 * Contexte (LOT 6 — schéma de persistance du triplet + matchs importés) :
 *   Le schéma actuel de `championships` n'a ni lien vers `teams`, ni le
 *   triplet `cp_no/phase/poule`. `championship_standings` est en réalité
 *   une table de matchs sans clé d'idempotence (`dofa_ma_no`), ce qui
 *   dupliquerait tout à chaque ré-import.
 *
 *   ⚠️ Garde-fou le plus important de ce lot : `home_score`/`away_score`
 *   sont aujourd'hui `INTEGER DEFAULT 0`. Un match à venir a un score
 *   `null` côté DOFA ; avec ce défaut il serait écrit `0-0` et compterait
 *   comme un match nul, faussant tout le classement. La migration rendra
 *   ces colonnes NULLables sans défaut — ces tests verrouillent que le
 *   MAPPING produit bien `null`, jamais `0` ni `undefined`.
 *
 * Phase "Red" attendue : src/lib/dofa/persist-mapping.ts n'existe pas
 * encore → tous les tests échouent à l'import.
 *
 * Périmètre strict : fonctions PURES de mapping `DofaMatch[]` → lignes DB.
 * Aucun accès Supabase, aucun SQL, aucune exécution réelle — hors-scope
 * explicite du lot (cf. TODO lot 6).
 *
 * Signatures attendues (contrat imposé à @dev) :
 *   buildChampionshipUpsert(input: BuildChampionshipUpsertInput): ChampionshipUpsert
 *   buildMatchUpserts(matches: DofaMatch[], championshipId: string): MatchUpsert[]
 *
 * Forme proposée de `ChampionshipUpsert` (clé d'idempotence :
 * `team_id` + `dofa_cp_no` + `dofa_phase` + `dofa_poule`, alignée sur
 * l'index unique partiel prévu en migration) :
 *   {
 *     team_id: string,
 *     dofa_cp_no: number,
 *     dofa_phase: number,
 *     dofa_poule: number,
 *     dofa_cl_no: number,       // identité de l'équipe suivie (jamais short_name seul)
 *     dofa_team_number: number,
 *     last_imported_at: string, // ISO, horodatage de l'import
 *   }
 *
 * Forme proposée de `MatchUpsert` (clé d'idempotence : `championship_id` +
 * `dofa_ma_no`, alignée sur l'index unique prévu en migration) :
 *   {
 *     championship_id: string,
 *     dofa_ma_no: number,
 *     matchday_number: number | null,
 *     home_team: string,        // short_name affiché
 *     away_team: string,
 *     home_score: number | null,
 *     away_score: number | null,
 *     kickoff: string | null,
 *     location: string | null,
 *     location_address: string | null,
 *     location_city: string | null,
 *     postponed: boolean,
 *     home_is_forfeit: boolean,
 *     away_is_forfeit: boolean,
 *     source: "dofa_import",    // distingue l'import d'une saisie manuelle du coach
 *   }
 *
 * ⚠️ Test-sentinelle (non-effacement) :
 *   `buildMatchUpserts([], championshipId)` doit renvoyer `[]` — un
 *   tableau d'upserts VIDE, jamais une instruction de suppression. La
 *   fonction étant pure et ne retournant QUE des lignes à upserter (pas
 *   de DELETE, pas de TRUNCATE, pas de flag "replace all"), un payload
 *   vide en entrée ne peut, par construction du contrat, se traduire en
 *   aucune façon par un effacement des matchs existants : @dev ne doit
 *   jamais faire précéder l'upsert d'un DELETE basé sur ce retour vide.
 *   On verrouille ici la forme du retour (tableau vide, pas de champ
 *   d'effacement, pas d'exception) qui est la seule garantie que peut
 *   donner une fonction de mapping pure sur ce risque.
 */

import { describe, it, expect } from "vitest";
import fixtureRaw from "@/lib/dofa/__fixtures__/resultat-d4-pouleD.json";
import { parseDofaMatches, type DofaMatch } from "@/lib/dofa/parse-matches";
import {
  buildChampionshipUpsert,
  buildMatchUpserts,
} from "@/lib/dofa/persist-mapping";

const TEAM_ID = "11111111-1111-1111-1111-111111111111";
const CHAMPIONSHIP_ID = "22222222-2222-2222-2222-222222222222";

function cloneFixture(): unknown[] {
  return JSON.parse(JSON.stringify(fixtureRaw));
}

describe("buildChampionshipUpsert — triplet cp_no/phase/poule + identité de l'équipe suivie", () => {
  it("produit team_id, le triplet dofa_cp_no/dofa_phase/dofa_poule et l'identité dofa_cl_no/dofa_team_number", () => {
    const result = buildChampionshipUpsert({
      teamId: TEAM_ID,
      cpNo: 457587,
      phase: 1,
      poule: 4,
      clNo: 206181,
      teamNumber: 6,
    });

    expect(result.team_id, "team_id doit être propagé tel quel").toBe(
      TEAM_ID
    );
    expect(result.dofa_cp_no).toBe(457587);
    expect(result.dofa_phase).toBe(1);
    expect(result.dofa_poule).toBe(4);
    expect(
      result.dofa_cl_no,
      "l'identité de l'équipe suivie doit reposer sur club.cl_no, jamais short_name seul"
    ).toBe(206181);
    expect(result.dofa_team_number).toBe(6);
  });
});

describe("buildMatchUpserts — nominal critique sur la fixture réelle", () => {
  const matches: DofaMatch[] = parseDofaMatches(cloneFixture());
  const rows = buildMatchUpserts(matches, CHAMPIONSHIP_ID);

  it("produit exactement 3 lignes de match, une par match de la fixture", () => {
    expect(rows).toHaveLength(3);
  });

  it("renseigne dofa_ma_no et matchday_number: 1 sur chaque ligne", () => {
    for (const row of rows) {
      expect(row.dofa_ma_no).toEqual(expect.any(Number));
      expect(row.matchday_number).toBe(1);
    }
    expect(rows.map((r) => r.dofa_ma_no)).toEqual([
      56363596, 56363599, 56363601,
    ]);
  });

  it("compose correctement le kickoff (date + heure locale du terrain, instant UTC réel — BUG dates décalées de 2h corrigé)", () => {
    // 13H00/15H00 heure française = 11:00/13:00 UTC en septembre (UTC+2).
    expect(Date.parse(rows[0].kickoff as string)).toBe(
      Date.UTC(2026, 8, 6, 11, 0, 0)
    );
    expect(Date.parse(rows[1].kickoff as string)).toBe(
      Date.UTC(2026, 8, 6, 13, 0, 0)
    );
    expect(Date.parse(rows[2].kickoff as string)).toBe(
      Date.UTC(2026, 8, 6, 11, 0, 0)
    );
  });

  it("⚠️ GARDE-FOU CRITIQUE : un match non joué a home_score/away_score à null, jamais 0", () => {
    for (const row of rows) {
      expect(
        row.home_score,
        "un score absent ne doit JAMAIS être mappé à 0 (faux 0-0 qui fausserait le classement)"
      ).toBeNull();
      expect(
        row.away_score,
        "un score absent ne doit JAMAIS être mappé à 0 (faux 0-0 qui fausserait le classement)"
      ).toBeNull();
      expect(row.home_score).not.toBe(0);
      expect(row.away_score).not.toBe(0);
    }
  });

  it("porte le championship_id fourni sur chaque ligne", () => {
    for (const row of rows) {
      expect(row.championship_id).toBe(CHAMPIONSHIP_ID);
    }
  });
});

describe("buildMatchUpserts — idempotence (ré-import sans doublon)", () => {
  it("deux appels successifs sur la même fixture produisent les mêmes clés dofa_ma_no, dans le même ordre, sans identifiant aléatoire", () => {
    const matchesA = parseDofaMatches(cloneFixture());
    const matchesB = parseDofaMatches(cloneFixture());

    const rowsA = buildMatchUpserts(matchesA, CHAMPIONSHIP_ID);
    const rowsB = buildMatchUpserts(matchesB, CHAMPIONSHIP_ID);

    expect(rowsA.map((r) => r.dofa_ma_no)).toEqual(
      rowsB.map((r) => r.dofa_ma_no)
    );
    // Les deux upserts doivent être structurellement identiques (aucun
    // champ non-déterministe type uuid/random/timestamp d'exécution qui
    // empêcherait Supabase de reconnaître la même ligne à l'upsert).
    expect(rowsA).toEqual(rowsB);
  });
});

describe("buildMatchUpserts — cas limites", () => {
  it("terrain: null → champs de lieu null, sans crash", () => {
    const raw = cloneFixture() as Array<Record<string, unknown>>;
    raw[0].terrain = null;
    const matches = parseDofaMatches(raw);
    const rows = buildMatchUpserts(matches, CHAMPIONSHIP_ID);

    expect(rows[0].location).toBeNull();
    expect(rows[0].location_address).toBeNull();
    expect(rows[0].location_city).toBeNull();
  });

  it("seems_postponed renseigné ('O') → postponed: true", () => {
    const raw = cloneFixture() as Array<Record<string, unknown>>;
    raw[0].seems_postponed = "O";
    const matches = parseDofaMatches(raw);
    const rows = buildMatchUpserts(matches, CHAMPIONSHIP_ID);

    expect(rows[0].postponed).toBe(true);
    // Les autres matchs, non impactés, restent non reportés.
    expect(rows[1].postponed).toBe(false);
  });

  it("home_is_forfeit / away_is_forfeit ('O') sont correctement reportés", () => {
    const raw = cloneFixture() as Array<Record<string, unknown>>;
    raw[0].home_is_forfeit = "O";
    raw[1].away_is_forfeit = "O";
    const matches = parseDofaMatches(raw);
    const rows = buildMatchUpserts(matches, CHAMPIONSHIP_ID);

    expect(rows[0].home_is_forfeit).toBe(true);
    expect(rows[0].away_is_forfeit).toBe(false);
    expect(rows[1].away_is_forfeit).toBe(true);
    expect(rows[1].home_is_forfeit).toBe(false);
  });
});

describe("buildMatchUpserts — robustesse et non-effacement (test-sentinelle)", () => {
  it("un tableau vide en entrée produit un tableau vide en sortie, jamais une exception", () => {
    expect(() => buildMatchUpserts([], CHAMPIONSHIP_ID)).not.toThrow();
    expect(buildMatchUpserts([], CHAMPIONSHIP_ID)).toEqual([]);
  });

  it(
    "⚠️ TEST-SENTINELLE : un payload vide ne peut jamais se traduire par un effacement — " +
      "la fonction ne renvoie QUE des lignes à upserter, jamais une instruction de suppression",
    () => {
      const result = buildMatchUpserts([], CHAMPIONSHIP_ID);

      // Le contrat de la fonction est : « produire des lignes à upserter ».
      // Un tableau vide ne porte aucune sémantique de suppression — il ne
      // contient ni flag `deleteAll`, ni marqueur `_replace`, ni aucune
      // information indiquant à l'appelant de vider la table. C'est un
      // pur no-op côté DB. On verrouille cette forme de retour pour
      // qu'aucune évolution future ne transforme silencieusement ce
      // no-op en directive de suppression.
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
      expect(result).not.toHaveProperty("deleteAll");
      expect(result).not.toHaveProperty("_replace");
    }
  );
});

describe("buildMatchUpserts — traçabilité de la source (protection des modifications du coach)", () => {
  it("chaque ligne issue de l'import porte une source distincte d'une saisie manuelle", () => {
    const matches = parseDofaMatches(cloneFixture());
    const rows = buildMatchUpserts(matches, CHAMPIONSHIP_ID);

    for (const row of rows) {
      expect(row.source).toBe("dofa_import");
      expect(row.source).not.toBe("manual");
    }
  });
});
