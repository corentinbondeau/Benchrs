import type { DofaMatch, DofaMatchTeam } from "./parse-matches";

/**
 * Équipe de la poule reconstituée à partir des matchs collés par le coach
 * (calendrier de la journée à venir, 6 matchs = 12 équipes). Sert à peupler
 * la liste dans laquelle le coach clique sa propre équipe — ce choix est
 * ensuite persisté via `PATCH /api/championships` (`dofa_cl_no` /
 * `dofa_team_number`), l'identité sans laquelle `planEventSync` ne
 * reconnaît aucun match (correctif « agenda vide »).
 *
 * Mêmes champs que `DofaMatchTeam` : jamais `shortName` seul comme
 * identité (cause du bug « Match vs CAMPHIN PEVELE ECF »).
 */
export interface PouleTeam {
  clNo: number;
  number: number;
  shortName: string;
}

function isCompleteTeam(team: unknown): team is DofaMatchTeam {
  if (!team || typeof team !== "object") return false;
  const t = team as Record<string, unknown>;
  return typeof t.clNo === "number" && typeof t.number === "number";
}

/**
 * Extrait la liste des équipes distinctes d'une poule à partir de ses
 * matchs, dédoublonnées sur le couple `(clNo, number)` — jamais `clNo`
 * seul (un même club peut engager plusieurs équipes) ni `shortName` seul.
 * Triée alphabétiquement sur `shortName`, `clNo` puis `number` en
 * départage déterministe.
 */
export function extractPouleTeams(matches: DofaMatch[]): PouleTeam[] {
  const byKey = new Map<string, PouleTeam>();

  for (const match of matches ?? []) {
    for (const team of [match?.homeTeam, match?.awayTeam]) {
      if (!isCompleteTeam(team)) continue;
      const key = `${team.clNo}/${team.number}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          clNo: team.clNo,
          number: team.number,
          shortName: typeof team.shortName === "string" ? team.shortName : "",
        });
      }
    }
  }

  return Array.from(byKey.values()).sort(
    (a, b) =>
      a.shortName.localeCompare(b.shortName) || a.clNo - b.clNo || a.number - b.number
  );
}
