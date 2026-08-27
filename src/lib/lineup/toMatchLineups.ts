import type { FormationData } from "@/types";

export interface MatchLineupRow {
  event_id: string;
  player_id: string;
  position_label: string | null;
  is_starter: boolean;
  team_id: string;
}

/**
 * Projette `formation_data` (source riche persistée dans `formations`) en lignes
 * `match_lineups` (projection dénormalisée, reconstructible via DELETE+INSERT — §7.2/§7.3).
 *
 * Fonction PURE : aucune I/O.
 *
 * Contraintes de schéma respectées (voir toMatchLineups.test.ts) :
 * - `event_id` et `player_id` NOT NULL en base → les slots/places de banc vides
 *   (player_id null) sont filtrés, jamais traduits en ligne.
 * - `team_id` renseigné sur CHAQUE ligne (verrou anti-RLS).
 * - un même `player_id` n'apparaît jamais deux fois (pas de contrainte UNIQUE en base).
 */
export function toMatchLineupRows(
  formationData: FormationData,
  eventId: string,
  teamId: string,
): MatchLineupRow[] {
  const rows: MatchLineupRow[] = [];
  const seenPlayerIds = new Set<string>();

  for (const position of formationData.positions ?? []) {
    if (!position.player_id || seenPlayerIds.has(position.player_id)) continue;
    seenPlayerIds.add(position.player_id);
    rows.push({
      event_id: eventId,
      player_id: position.player_id,
      position_label: position.label ?? null,
      is_starter: true,
      team_id: teamId,
    });
  }

  for (const playerId of formationData.bench ?? []) {
    if (!playerId || seenPlayerIds.has(playerId)) continue;
    seenPlayerIds.add(playerId);
    rows.push({
      event_id: eventId,
      player_id: playerId,
      position_label: null,
      is_starter: false,
      team_id: teamId,
    });
  }

  return rows;
}
