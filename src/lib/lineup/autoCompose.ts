import { labelToKey, type PositionKey } from "./positions";

// Fonction PURE : aucune dépendance React / Supabase / réseau.
//
// Stratégie d'affectation (arbitrage utilisateur validé, remplace le TODO d'origine) :
//   1. Le gardien (slot role "GK") est résolu en priorité absolue, avant tout autre poste.
//   2. Pour chaque slot restant (dans l'ordre du tableau `slots`), on cherche le meilleur
//      candidat disponible :
//        - score 2 si le slot.role correspond au poste PRINCIPAL du joueur,
//        - score 1 si le slot.role correspond à l'un de ses postes SECONDAIRES,
//        - le joueur n'est pas candidat du tout si le slot.role n'apparaît ni en principal
//          ni en secondaire (pas de repli par famille/compatibilité).
//      Le meilleur score l'emporte ; à score égal, on départage par `id` croissant, pour un
//      résultat déterministe et indépendant de l'ordre d'entrée.
//   3. Si aucun candidat n'est éligible pour un slot, CE SLOT RESTE VIDE (aucune clé
//      "slot-i" dans `assignments`) — pas de remplissage "à tout prix".
//   4. Les joueurs non placés en titulaire vont au banc (dans la limite de `benchSize`),
//      triés par `id` croissant pour rester déterministes ; le surplus part dans
//      `unassigned` (également trié par `id`).
//
// `preferred_foot` n'existe pas dans ComposablePlayer : il ne peut donc structurellement
// pas influencer le résultat (exclusion verrouillée par le test dédié).

export interface ComposablePlayer {
  id: string;
  position?: string | null;
  secondary_positions?: string[] | null;
}

export interface ComposableSlot {
  role: PositionKey;
}

export interface AutoComposeInput {
  slots: ComposableSlot[];
  players: ComposablePlayer[];
  benchSize: number;
}

export interface AutoComposeResult {
  assignments: Record<string, string>;
  bench: Record<string, string>;
  unassigned: string[];
}

// Score de correspondance joueur/poste : 2 = principal, 1 = secondaire, 0 = aucun match.
function matchScore(player: ComposablePlayer, role: PositionKey): number {
  const principalKey = labelToKey(player.position);
  if (principalKey === role) return 2;

  const secondaryKeys = (player.secondary_positions ?? []).map((label) => labelToKey(label));
  if (secondaryKeys.includes(role)) return 1;

  return 0;
}

export function autoCompose(input: AutoComposeInput): AutoComposeResult {
  const { slots, players, benchSize } = input;

  const assignments: Record<string, string> = {};
  const remaining = new Set(players.map((p) => p.id));
  const playersById = new Map(players.map((p) => [p.id, p]));

  // Ordre de résolution des slots : le gardien (GK) en priorité absolue, puis les autres
  // slots dans leur ordre d'origine.
  const slotIndices = slots.map((_, i) => i);
  const gkIndices = slotIndices.filter((i) => slots[i].role === "GK");
  const otherIndices = slotIndices.filter((i) => slots[i].role !== "GK");
  const resolutionOrder = [...gkIndices, ...otherIndices];

  for (const slotIndex of resolutionOrder) {
    const role = slots[slotIndex].role;

    let bestPlayerId: string | null = null;
    let bestScore = 0;

    for (const playerId of remaining) {
      const player = playersById.get(playerId);
      if (!player) continue;

      const score = matchScore(player, role);
      if (score === 0) continue;

      if (
        score > bestScore ||
        (score === bestScore && bestPlayerId !== null && playerId < bestPlayerId)
      ) {
        bestScore = score;
        bestPlayerId = playerId;
      } else if (bestPlayerId === null) {
        bestScore = score;
        bestPlayerId = playerId;
      }
    }

    if (bestPlayerId !== null) {
      assignments[`slot-${slotIndex}`] = bestPlayerId;
      remaining.delete(bestPlayerId);
    }
  }

  // Joueurs non titularisés : banc puis surplus, triés par id croissant (déterminisme).
  const leftover = Array.from(remaining).sort();

  const bench: Record<string, string> = {};
  const benchIds = leftover.slice(0, benchSize);
  benchIds.forEach((id, i) => {
    bench[`bench-${i}`] = id;
  });

  const unassigned = leftover.slice(benchSize);

  return { assignments, bench, unassigned };
}
