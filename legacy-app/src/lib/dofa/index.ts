export {
  fetchPouleResultats,
  fetchPouleCalendrier,
  fetchPouleClassement,
  fetchPouleMatchs,
  fetchPouleJournees,
  fetchPoule,
  DofaUnavailableError,
} from "./client";

export type { DofaPouleRef as DofaPouleRefClient } from "./client";

export { parsePouleUrl } from "./poule-url";

export { normalizeDofaCollection } from "./normalize";

export {
  parseDofaMatches,
  parseTime,
  composeKickoff,
} from "./parse-matches";
export type { DofaMatch as ParsedDofaMatch, DofaMatchTeam, DofaLocation } from "./parse-matches";

export {
  computeStandings,
  isPartialCoverage,
  parseOfficialStandings,
  resolveStandings,
} from "./standings";
export type { StandingRow } from "./standings";

export type { DofaRawMatch, DofaPouleRef, TeamIdentity, DofaTeamRef, DofaTerrain } from "./types";
