import { computeAttendanceRate } from "@/lib/attendance/computeAttendanceRate";

/**
 * Construction du classement (Leaderboard) de l'onglet Performance.
 *
 * La liste des joueurs est TOUJOURS issue du roster (team_members role=player),
 * indépendamment des matchs joués : ainsi l'onglet Assiduité (présence aux
 * entraînements) s'affiche même quand aucun match n'a encore eu lieu.
 *
 * Règle métier : l'assiduité ne compte QUE la présence aux entraînements
 * (events.type='training'), jamais les matchs. Voir computeAttendanceRate.
 */

export interface RosterPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
}

export interface MatchStatRow {
  player_id: string;
  goals?: number;
  assists?: number;
  yellow_cards?: number;
  red_cards?: number;
  minutes_played?: number;
}

export interface AttendanceRow {
  user_id: string;
  event_id: string;
  status: string;
}

export interface LeaderboardEntry {
  player_id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  minutes_played: number;
  matches_played: number;
  attendance_rate: number;
  trainings_count: number;
}

export function buildLeaderboard(
  roster: RosterPlayer[],
  matchStats: MatchStatRow[],
  attendances: AttendanceRow[],
  trainingIds: string[]
): LeaderboardEntry[] {
  const trainingSet = new Set(trainingIds);

  // Entrées initialisées à zéro pour chaque joueur du roster (source de vérité).
  const entries = new Map<string, LeaderboardEntry>();
  for (const p of roster) {
    entries.set(p.player_id, {
      player_id: p.player_id,
      first_name: p.first_name,
      last_name: p.last_name,
      shirt_number: p.shirt_number,
      goals: 0,
      assists: 0,
      yellow_cards: 0,
      red_cards: 0,
      minutes_played: 0,
      matches_played: 0,
      attendance_rate: 0,
      trainings_count: 0,
    });
  }

  // Agrégation des stats de match (uniquement pour les joueurs du roster).
  for (const s of matchStats) {
    const entry = entries.get(s.player_id);
    if (!entry) continue;
    entry.goals += s.goals ?? 0;
    entry.assists += s.assists ?? 0;
    entry.yellow_cards += s.yellow_cards ?? 0;
    entry.red_cards += s.red_cards ?? 0;
    entry.minutes_played += s.minutes_played ?? 0;
    entry.matches_played += 1;
  }

  // Regroupement des attendances d'entraînement par joueur.
  const attByPlayer = new Map<string, AttendanceRow[]>();
  for (const a of attendances) {
    if (!trainingSet.has(a.event_id)) continue;
    const list = attByPlayer.get(a.user_id) ?? [];
    list.push(a);
    attByPlayer.set(a.user_id, list);
  }

  for (const entry of entries.values()) {
    const list = attByPlayer.get(entry.player_id) ?? [];
    entry.trainings_count = list.length;
    // computeAttendanceRate renvoie null si aucune convocation training → 0 affiché.
    entry.attendance_rate = computeAttendanceRate(
      list.map((a) => ({ event_id: a.event_id, status: a.status })),
      trainingIds
    ) ?? 0;
  }

  return Array.from(entries.values());
}
