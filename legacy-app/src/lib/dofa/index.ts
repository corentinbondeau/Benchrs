export {
  fetchClubEquipes,
  fetchCalendrier,
  fetchResultats,
  fetchClassement,
  parseTeams,
  parseMatches,
  DofaUnavailableError,
} from "./client";

export type {
  DOFAEquipe,
  DOFAMatch,
  DOFATeam,
  ParsedTeam,
  ParsedMatch,
} from "./client";

export { normalizeDofaCollection } from "./normalize";

export {
  parseDofaMatches,
  parseTime,
  composeKickoff,
} from "./parse-matches";
export type { DofaMatch as ParsedDofaMatch, DofaMatchTeam, DofaLocation } from "./parse-matches";

export {
  computeStandings,
  parseOfficialStandings,
  resolveStandings,
} from "./standings";
export type { StandingRow } from "./standings";

export type { DofaRawMatch, DofaPouleRef, TeamIdentity, DofaTeamRef, DofaTerrain } from "./types";
