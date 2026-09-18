import { describe, it, expect } from "vitest";
import type { PouleTeam } from "../dofa/poule-teams";
import { generatePoolFixtures, teamKey } from "./round-robin";
import {
  collectPoolTeams,
  existingOrderedPairs,
  missingPoolFixtureRows,
  orderedPairKey,
} from "./pool-generation";

function team(n: number): PouleTeam {
  return { clNo: 1000 + n, number: 1, shortName: `T${n}` };
}

function poolOf(count: number): PouleTeam[] {
  return Array.from({ length: count }, (_, i) => team(i + 1));
}

describe("generatePoolFixtures — double round-robin", () => {
  it("2 équipes jouent l'aller ET le retour (home/away inversés)", () => {
    const fixtures = generatePoolFixtures(poolOf(2));
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0]).toMatchObject({ home: team(1), away: team(2), matchday: 1 });
    expect(fixtures[1]).toMatchObject({ home: team(2), away: team(1), matchday: 2 });
  });

  it("10 équipes → 90 matchs, chaque paire dans chaque sens, matchdays 1..18", () => {
    const teams = poolOf(10);
    const fixtures = generatePoolFixtures(teams);

    expect(fixtures).toHaveLength(90);

    const ordered = new Set<string>();
    const unordered = new Map<string, number>();
    let selfMatches = 0;

    for (const f of fixtures) {
      expect(f.matchday).toBeGreaterThanOrEqual(1);
      expect(f.matchday).toBeLessThanOrEqual(18);
      if (teamKey(f.home.clNo, f.home.number) === teamKey(f.away.clNo, f.away.number)) {
        selfMatches += 1;
      }
      const oKey = orderedPairKey(f.home, f.away);
      expect(ordered.has(oKey)).toBe(false);
      ordered.add(oKey);

      const [hk, ak] = [teamKey(f.home.clNo, f.home.number), teamKey(f.away.clNo, f.away.number)];
      const uKey = hk < ak ? `${hk}|${ak}` : `${ak}|${hk}`;
      unordered.set(uKey, (unordered.get(uKey) ?? 0) + 1);
    }

    expect(selfMatches).toBe(0);
    // Chaque paire non ordonnée apparaît exactement 2 fois (aller + retour).
    expect(unordered.size).toBe(45);
    for (const [, count] of unordered) expect(count).toBe(2);
  });

  it("chaque équipe joue exactement une fois par journée (10 équipes)", () => {
    const teams = poolOf(10);
    const fixtures = generatePoolFixtures(teams);
    const byMatchday = new Map<number, string[]>();

    for (const f of fixtures) {
      const list = byMatchday.get(f.matchday) ?? [];
      list.push(teamKey(f.home.clNo, f.home.number), teamKey(f.away.clNo, f.away.number));
      byMatchday.set(f.matchday, list);
    }

    for (const t of teams) {
      const k = teamKey(t.clNo, t.number);
      for (const [, matchdayTeams] of byMatchday) {
        const appearances = matchdayTeams.filter((x) => x === k).length;
        expect(appearances).toBeLessThanOrEqual(1);
      }
      // Chaque équipe dispute 18 matchs au total.
      const total = (fixtures.filter((f) => f.home.clNo === t.clNo || f.away.clNo === t.clNo)).length;
      expect(total).toBe(18);
    }
  });

  it("5 équipes (nombre impair) → 20 matchs, une équipe exempte par journée", () => {
    const fixtures = generatePoolFixtures(poolOf(5));
    expect(fixtures).toHaveLength(20);
    // Double round-robin : matchdays aller 1..4, retour 5..8.
    const matchdays = new Set(fixtures.map((f) => f.matchday));
    expect(Math.min(...matchdays)).toBe(1);
    expect(Math.max(...matchdays)).toBe(10);

    // 5 équipes → 10 paires non ordonnées, chacune 2 fois.
    const unordered = new Map<string, number>();
    for (const f of fixtures) {
      const [hk, ak] = [teamKey(f.home.clNo, f.home.number), teamKey(f.away.clNo, f.away.number)];
      const uKey = hk < ak ? `${hk}|${ak}` : `${ak}|${hk}`;
      unordered.set(uKey, (unordered.get(uKey) ?? 0) + 1);
    }
    expect(unordered.size).toBe(10);
    for (const [, count] of unordered) expect(count).toBe(2);
  });

  it("moins de 2 équipes → aucun calendrier", () => {
    expect(generatePoolFixtures([])).toHaveLength(0);
    expect(generatePoolFixtures(poolOf(1))).toHaveLength(0);
  });
});

describe("pool-generation", () => {
  it("collectPoolTeams dédoublonne sur cl_no + number", () => {
    const teams = collectPoolTeams([
      { cl_no: 1001, number: 1, short_name: "ECC" },
      { cl_no: 1001, number: 1, short_name: "ECC (doublon)" },
      { cl_no: 1001, number: 2, short_name: "ECC B" },
      { cl_no: 1002, number: 1, short_name: "PEVELE" },
    ]);
    expect(teams).toHaveLength(3);
  });

  it("missingPoolFixtureRows saute les confrontations déjà présentes (sens exact)", () => {
    const teams = poolOf(3);
    const fixtures = generatePoolFixtures(teams);

    // Ligne existante : T1 recevant T2 (aller).
    const existing = existingOrderedPairs([{ home_cl_no: 1001, home_team_number: 1, away_cl_no: 1002, away_team_number: 1 }]);

    const rows = missingPoolFixtureRows(fixtures, existing, "champ-1");
    // 6 matchs attendus (3 équipes), un seul déjà présent → 5 inserts.
    expect(rows).toHaveLength(5);
    expect(rows.some((r) => r.home_cl_no === 1001 && r.away_cl_no === 1002)).toBe(false);
    // Le sens inverse (T2 vs T1) doit être généré.
    expect(rows.some((r) => r.home_cl_no === 1002 && r.away_cl_no === 1001)).toBe(true);

    // Idempotence : re-générer avec le nouvel état → plus rien à insérer.
    const nowExisting = existingOrderedPairs(
      rows.map((r) => ({ home_cl_no: r.home_cl_no, home_team_number: r.home_team_number, away_cl_no: r.away_cl_no, away_team_number: r.away_team_number }))
    );
    for (const pair of existing) nowExisting.add(pair);
    expect(missingPoolFixtureRows(fixtures, nowExisting, "champ-1")).toHaveLength(0);
  });

  it("missingPoolFixtureRows produit des lignes source manual, scores null, sans date", () => {
    const fixtures = generatePoolFixtures(poolOf(2));
    const rows = missingPoolFixtureRows(fixtures, existingOrderedPairs([]), "champ-1");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.source).toBe("manual");
      expect(row.home_score).toBeNull();
      expect(row.away_score).toBeNull();
      expect(row.kickoff).toBeNull();
      expect(row.location).toBeNull();
      expect(row.postponed).toBe(false);
      expect(row.home_is_forfeit).toBe(false);
      expect(row.away_is_forfeit).toBe(false);
      expect(row.home_team).toBeTruthy();
      expect(row.away_team).toBeTruthy();
    }
  });
});