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
