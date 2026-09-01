/**
 * Tests — parseDofaMatches() / parseTime() / composeKickoff() (src/lib/dofa/parse-matches.ts)
 *
 * Contexte (cause n°4 du diagnostic — LA plus grave) :
 *   Le parser historique attendait des champs (`dateMatch`, `heureMatch`,
 *   `equipeAccueil.libelle`, `stade.libelle`) qui n'existent PAS dans le
 *   contrat réel de l'API compétition. Résultat : liste toujours vide,
 *   SANS ERREUR. C'est ce défaut qui a rendu la panne invisible pendant
 *   des mois. Ce fichier de tests verrouille le parser contre une
 *   régression de cette nature, sur la fixture RÉELLE (3 matchs
 *   authentiques du District des Flandres, saison 2026, D4 poule D).
 *
 * Phase "Red" attendue : src/lib/dofa/parse-matches.ts n'existe pas
 * encore → tous les tests échouent à l'import.
 *
 * Hors-scope explicite (cf. TODO lot 2) :
 *   - pas de test de tri des matchs (cf. lot 3, standings.test.ts) ;
 *   - pas de test du classement (cf. lot 3) ;
 *   - pas de test spécifique de `calendrier`/`poule_journees` : mêmes
 *     champs, même parser — un test de forme suffit (couvert plus bas).
 *
 * Signatures attendues (contrat imposé à @dev) :
 *   parseDofaMatches(data: unknown): DofaMatch[]
 *   parseTime(time: string | null | undefined): { hours: number; minutes: number } | null
 *   composeKickoff(date: string, time: string | null | undefined): string | null
 *
 * Forme attendue d'un DofaMatch (contrat minimal exercé par ces tests) :
 *   {
 *     maNo: number,
 *     matchday: number | null,
 *     kickoff: string | null,       // ex. "2026-09-06T15:00" (date + heure composées, heure locale du terrain)
 *     date: string,                 // date brute ISO conservée telle quelle
 *     homeTeam: { clNo: number, number: number, shortName: string },
 *     awayTeam: { clNo: number, number: number, shortName: string },
 *     homeScore: number | null,
 *     awayScore: number | null,
 *     homeIsForfeit: boolean,
 *     awayIsForfeit: boolean,
 *     location: { name: string | null, address: string | null, zipCode: string | null, city: string | null } | null,
 *     seemsPostponed: boolean,
 *     status: string | null,
 *   }
 */

import { describe, it, expect } from "vitest";
import fixtureRaw from "@/lib/dofa/__fixtures__/resultat-d4-pouleD.json";
import {
  parseDofaMatches,
  parseTime,
  composeKickoff,
} from "@/lib/dofa/parse-matches";

// Copie profonde de la fixture pour éviter toute pollution inter-tests
// (certains tests suppriment/mutent des champs sur un clone).
function cloneFixture(): unknown[] {
  return JSON.parse(JSON.stringify(fixtureRaw));
}

describe("parseDofaMatches — nominal critique sur la fixture réelle (garde-fou direct cause n°4)", () => {
  it("extrait bien les 3 matchs de la fixture (jamais 0 — le bug historique renvoyait une liste vide)", () => {
    const result = parseDofaMatches(cloneFixture());
    expect(result).toHaveLength(3);
  });

  it("le match CAMPHIN PEVELE ECF (15H00) a un kickoff correctement composé (instant UTC réel, 15H00 heure française = 13:00 UTC en septembre) et des scores null préservés", () => {
    const [result] = parseDofaMatches(cloneFixture()).filter(
      (m) => m.maNo === 56363599
    );
    expect(result, "le match ma_no 56363599 doit être présent").toBeDefined();
    expect(Date.parse(result.kickoff as string)).toBe(
      Date.UTC(2026, 8, 6, 13, 0, 0)
    );
    expect(result.matchday).toBe(1);
    expect(result.homeScore).toBeNull();
    expect(result.awayScore).toBeNull();
  });

  it("un match à 13H00 (ma_no 56363596) a un kickoff distinct correctement composé (13H00 heure française = 11:00 UTC en septembre)", () => {
    const [result] = parseDofaMatches(cloneFixture()).filter(
      (m) => m.maNo === 56363596
    );
    expect(result).toBeDefined();
    expect(Date.parse(result.kickoff as string)).toBe(
      Date.UTC(2026, 8, 6, 11, 0, 0)
    );
  });

  it("poule_journee.number alimente matchday pour tous les matchs de la fixture", () => {
    const results = parseDofaMatches(cloneFixture());
    expect(results.every((m) => m.matchday === 1)).toBe(true);
  });

  it("terrain produit un lieu exploitable (nom, adresse, ville)", () => {
    const [result] = parseDofaMatches(cloneFixture()).filter(
      (m) => m.maNo === 56363599
    );
    expect(result.location).toEqual(
      expect.objectContaining({
        name: "STADE MUNICIPAL",
        address: "2 RUE DE LA BASSE COUTURE",
        city: "CAMPHIN EN PEVELE",
        zipCode: "59780",
      })
    );
  });

  it("scores null sont PRÉSERVÉS en null — jamais convertis en 0 (le schéma DEFAULT 0 fausserait le classement)", () => {
    const results = parseDofaMatches(cloneFixture());
    for (const m of results) {
      expect(m.homeScore, `homeScore du match ${m.maNo}`).toBeNull();
      expect(m.awayScore, `awayScore du match ${m.maNo}`).toBeNull();
      // garde-fou explicite : ne doit jamais valoir 0 (0 est une valeur
      // valide de score joué, distincte de "non joué")
      expect(m.homeScore).not.toBe(0);
      expect(m.awayScore).not.toBe(0);
    }
  });
});

describe("parseDofaMatches — identité d'équipe : clé = club.cl_no + number (PIÈGE cause n°4 aggravée)", () => {
  it("homeTeam du match CAMPHIN PEVELE ECF porte bien cl_no=10428 et number=1", () => {
    const [result] = parseDofaMatches(cloneFixture()).filter(
      (m) => m.maNo === 56363599
    );
    expect(result.homeTeam).toEqual(
      expect.objectContaining({ clNo: 10428, number: 1 })
    );
  });

  it("les équipes à number != 1 de la fixture (PEVELE FC #6, LEERS OS #10) conservent leur number réel, jamais écrasé à 1", () => {
    const results = parseDofaMatches(cloneFixture());
    const peveleFc = results.find((m) => m.maNo === 56363596)!.homeTeam;
    const leersOs = results.find((m) => m.maNo === 56363601)!.awayTeam;
    expect(peveleFc).toEqual(
      expect.objectContaining({ clNo: 206181, number: 6, shortName: "PEVELE FC" })
    );
    expect(leersOs).toEqual(
      expect.objectContaining({ clNo: 796, number: 10, shortName: "LEERS OS" })
    );
  });

  it("[SYNTHÉTIQUE] deux équipes du MÊME club (même cl_no) mais numéros différents ne sont jamais confondues", () => {
    // Cas non représenté dans la fixture réelle (un seul club y engage une
    // seule équipe par match) : on construit un jeu synthétique minimal
    // pour verrouiller explicitement la règle d'identité cl_no + number.
    const synthetic = [
      {
        ...cloneFixture()[0] as Record<string, unknown>,
        ma_no: 90000001,
        home: {
          club: { cl_no: 42, logo: "" },
          number: 1,
          short_name: "CLUB X EQUIPE A",
        },
        away: {
          club: { cl_no: 999, logo: "" },
          number: 1,
          short_name: "ADVERSAIRE",
        },
      },
      {
        ...cloneFixture()[1] as Record<string, unknown>,
        ma_no: 90000002,
        home: {
          club: { cl_no: 42, logo: "" },
          number: 2,
          short_name: "CLUB X EQUIPE B",
        },
        away: {
          club: { cl_no: 998, logo: "" },
          number: 1,
          short_name: "AUTRE ADVERSAIRE",
        },
      },
    ];
    const results = parseDofaMatches(synthetic);
    expect(results).toHaveLength(2);
    const equipeA = results.find((m) => m.maNo === 90000001)!.homeTeam;
    const equipeB = results.find((m) => m.maNo === 90000002)!.homeTeam;
    expect(equipeA.clNo).toBe(42);
    expect(equipeB.clNo).toBe(42);
    // même club, numéros distincts : les deux équipes ne doivent JAMAIS
    // être vues comme identiques par un code d'agrégation naïf sur cl_no seul
    expect(equipeA.number).not.toBe(equipeB.number);
    expect(equipeA.number).toBe(1);
    expect(equipeB.number).toBe(2);
  });
});

describe("parseTime — conversion du format FFF \"HHhMM\" (séparateur H, pas :)", () => {
  it('convertit "15H00" en { hours: 15, minutes: 0 }', () => {
    expect(parseTime("15H00")).toEqual({ hours: 15, minutes: 0 });
  });

  it('convertit "13H00" en { hours: 13, minutes: 0 }', () => {
    expect(parseTime("13H00")).toEqual({ hours: 13, minutes: 0 });
  });

  it('cas limite — heure sur 1 chiffre "9H30" est correctement interprétée', () => {
    expect(parseTime("9H30")).toEqual({ hours: 9, minutes: 30 });
  });

  it('chaîne vide "" → null (pas de throw, pas d\'heure fantôme)', () => {
    expect(() => parseTime("")).not.toThrow();
    expect(parseTime("")).toBeNull();
  });

  it("null/undefined → null sans throw", () => {
    expect(parseTime(null)).toBeNull();
    expect(parseTime(undefined)).toBeNull();
  });

  it('format malformé (ex. "abc", "25H99") → null sans throw, jamais une heure invalide silencieuse', () => {
    expect(() => parseTime("abc")).not.toThrow();
    expect(parseTime("abc")).toBeNull();
    // 25H99 : heure/minute hors bornes → traité comme invalide plutôt que
    // silencieusement accepté (contrat imposé à @dev)
    expect(parseTime("25H99")).toBeNull();
  });
});

describe("composeKickoff — combine date (T00:00:00+00:00) + time (HHhMM) en instant UTC réel (BUG dates décalées de 2h corrigé)", () => {
  it("compose une date et une heure valides en instant UTC réel (15H00 heure française = 13:00 UTC en septembre, UTC+2)", () => {
    const result = composeKickoff("2026-09-06T00:00:00+00:00", "15H00");
    expect(result).not.toBeNull();
    expect(Date.parse(result as string)).toBe(Date.UTC(2026, 8, 6, 13, 0, 0));
  });

  it("time absent/vide/null → conserve la date seule, ne droppe jamais le match", () => {
    expect(composeKickoff("2026-09-06T00:00:00+00:00", null)).toBe(
      "2026-09-06"
    );
    expect(composeKickoff("2026-09-06T00:00:00+00:00", "")).toBe(
      "2026-09-06"
    );
  });

  it("time malformé → repli sur la date seule, jamais de throw ni d'horodatage aberrant", () => {
    expect(() =>
      composeKickoff("2026-09-06T00:00:00+00:00", "abc")
    ).not.toThrow();
    expect(composeKickoff("2026-09-06T00:00:00+00:00", "abc")).toBe(
      "2026-09-06"
    );
  });

  it("date manquante/vide → null, sans throw", () => {
    expect(composeKickoff("", "15H00")).toBeNull();
    // @ts-expect-error — robustesse volontaire contre une entrée non-string
    expect(composeKickoff(null, "15H00")).toBeNull();
  });

  it("match en janvier (heure d'hiver, UTC+1) : 15H00 heure française = 14:00 UTC", () => {
    const result = composeKickoff("2026-01-10T00:00:00+00:00", "15H00");
    expect(result).not.toBeNull();
    expect(Date.parse(result as string)).toBe(
      Date.UTC(2026, 0, 10, 14, 0, 0)
    );
  });

  it("[CAS LIMITE VERROUILLÉ] week-end du passage à l'heure d'HIVER (dernier dimanche d'octobre) : la veille (samedi, encore UTC+2) diffère de deux heures de calcul naïf comme le lendemain (UTC+1)", () => {
    // Samedi 24/10/2026, encore en heure d'été (UTC+2)
    const saturday = composeKickoff("2026-10-24T00:00:00+00:00", "15H00");
    expect(Date.parse(saturday as string)).toBe(Date.UTC(2026, 9, 24, 13, 0, 0));

    // Dimanche 25/10/2026 (jour du changement d'heure, bascule à 3h00 locale) :
    // un match d'après-midi a lieu APRÈS la bascule, donc déjà en UTC+1.
    // Une implémentation qui appliquerait UTC+2 toute l'année produirait
    // 13:00 UTC au lieu du vrai 14:00 UTC — c'est précisément le piège
    // verrouillé ici.
    const sunday = composeKickoff("2026-10-25T00:00:00+00:00", "15H00");
    expect(Date.parse(sunday as string)).toBe(Date.UTC(2026, 9, 25, 14, 0, 0));
  });

  it("[CAS LIMITE VERROUILLÉ] week-end du passage à l'heure d'ÉTÉ (dernier dimanche de mars) : la veille (samedi, encore UTC+1) diffère du lendemain (UTC+2)", () => {
    // Samedi 28/03/2026, encore en heure d'hiver (UTC+1)
    const saturday = composeKickoff("2026-03-28T00:00:00+00:00", "15H00");
    expect(Date.parse(saturday as string)).toBe(Date.UTC(2026, 2, 28, 14, 0, 0));

    // Dimanche 29/03/2026 (jour du changement d'heure, bascule à 2h00 locale
    // -> 3h00) : un match d'après-midi a lieu après la bascule, déjà en
    // UTC+2. Une implémentation figée sur UTC+1 produirait 14:00 UTC au
    // lieu du vrai 13:00 UTC.
    const sunday = composeKickoff("2026-03-29T00:00:00+00:00", "15H00");
    expect(Date.parse(sunday as string)).toBe(Date.UTC(2026, 2, 29, 13, 0, 0));
  });
});

describe("parseDofaMatches — forfaits", () => {
  it('"O" → true, "N" → false, absent → false (valeurs FFF)', () => {
    const base = cloneFixture()[0] as Record<string, unknown>;

    const forfaitO = parseDofaMatches([
      { ...base, ma_no: 90001, home_is_forfeit: "O", away_is_forfeit: "N" },
    ])[0];
    expect(forfaitO.homeIsForfeit).toBe(true);
    expect(forfaitO.awayIsForfeit).toBe(false);

    const noForfeitKey = { ...base, ma_no: 90002 } as Record<string, unknown>;
    delete noForfeitKey.home_is_forfeit;
    delete noForfeitKey.away_is_forfeit;
    const forfaitAbsent = parseDofaMatches([noForfeitKey])[0];
    expect(forfaitAbsent.homeIsForfeit).toBe(false);
    expect(forfaitAbsent.awayIsForfeit).toBe(false);
  });
});

describe("parseDofaMatches — variantes synthétiques (cas non représentés par la fixture)", () => {
  it("[SYNTHÉTIQUE] match joué avec scores conserve les scores numériques exacts", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const played = {
      ...base,
      ma_no: 90010,
      home_score: 2,
      away_score: 1,
    };
    const [result] = parseDofaMatches([played]);
    expect(result.homeScore).toBe(2);
    expect(result.awayScore).toBe(1);
  });

  it("[SYNTHÉTIQUE] match reporté (seems_postponed renseigné) → seemsPostponed: true", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const postponed = { ...base, ma_no: 90011, seems_postponed: "O" };
    const [result] = parseDofaMatches([postponed]);
    expect(result.seemsPostponed).toBe(true);
  });

  it("[SYNTHÉTIQUE] seems_postponed vide (comme dans la fixture réelle) → seemsPostponed: false", () => {
    const [result] = parseDofaMatches(cloneFixture()).filter(
      (m) => m.maNo === 56363599
    );
    expect(result.seemsPostponed).toBe(false);
  });
});

describe("parseDofaMatches — robustesse (entrée vide, champ manquant, time malformé) : jamais de crash, jamais de match fantôme", () => {
  it("entrée vide → tableau vide", () => {
    expect(parseDofaMatches([])).toEqual([]);
  });

  it("entrée null/undefined → tableau vide sans throw (délègue à normalizeDofaCollection)", () => {
    expect(() => parseDofaMatches(null)).not.toThrow();
    expect(parseDofaMatches(null)).toEqual([]);
    expect(parseDofaMatches(undefined)).toEqual([]);
  });

  it("élément sans ma_no → ignoré (pas de match fantôme sans identifiant)", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const withoutMaNo = { ...base };
    delete withoutMaNo.ma_no;
    const results = parseDofaMatches([withoutMaNo, cloneFixture()[1]]);
    // seul le second élément (valide) doit être présent
    expect(results).toHaveLength(1);
    expect(results[0].maNo).toBe(56363599);
  });

  it("terrain: null → lieu absent (location: null), sans crash", () => {
    const base = cloneFixture()[0] as Record<string, unknown>;
    const noTerrain = { ...base, ma_no: 90020, terrain: null };
    const [result] = parseDofaMatches([noTerrain]);
    expect(result.location).toBeNull();
  });

  it("home/away manquants sur un élément → cet élément est ignoré, les autres restent parsés", () => {
    const broken = { ma_no: 90021 }; // squelette minimal sans home/away
    const results = parseDofaMatches([broken, cloneFixture()[0]]);
    expect(results).toHaveLength(1);
    expect(results[0].maNo).toBe(56363596);
  });
});

describe("SENTINELLE — un format non reconnu ne doit jamais être confondu avec une absence réelle de matchs (anti régression cause n°4)", () => {
  // Proposition de contrat pour @dev :
  //   - Une entrée dont les éléments possèdent `ma_no` doit TOUJOURS produire
  //     au moins autant de matchs que d'éléments valides identifiables :
  //     un parser qui ne "comprend" pas le format (ex. mauvais noms de
  //     champs comme l'ancien `dateMatch`/`heureMatch`) ne doit PAS pouvoir
  //     silencieusement droper un `ma_no` par ailleurs présent et valide.
  //   - Un tableau réellement vide (`[]`, ou une saison sans aucun match
  //     programmé) est une situation métier légitime et DOIT rester
  //     distinguable en amont : `normalizeDofaCollection` ne lève jamais,
  //     mais la vacuité véhiculée par l'API elle-même (tableau nu vide ou
  //     hydra:totalItems: 0) est déjà vérifiée par normalize.test.ts.
  //   - Ce test verrouille le contrat au niveau du parser : dès qu'un
  //     `ma_no` est présent dans l'entrée, il DOIT se retrouver dans la
  //     sortie (sinon régression du bug historique = parser qui "n'a pas
  //     compris" le format et jette tout en silence).
  it("un tableau non vide dont TOUS les éléments portent un ma_no valide ne produit jamais 0 match", () => {
    const results = parseDofaMatches(cloneFixture());
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((m) => m.maNo).sort()).toEqual(
      [56363596, 56363599, 56363601].sort()
    );
  });

  it("un tableau non vide dont AUCUN élément n'a de ma_no produit légitimement 0 match (vacuité distincte d'un bug de format)", () => {
    const garbage = [{ foo: "bar" }, { baz: 1 }];
    expect(parseDofaMatches(garbage)).toEqual([]);
  });
});

describe("parseDofaMatches — forme partagée avec calendrier/poule_journees (mêmes champs, même parser)", () => {
  it("accepte aussi une entrée déjà enveloppée au format Hydra (ex. si calendrier renvoyait cette forme)", () => {
    const hydraWrapped = { "hydra:member": cloneFixture(), "hydra:totalItems": 3 };
    const results = parseDofaMatches(hydraWrapped);
    expect(results).toHaveLength(3);
  });
});
