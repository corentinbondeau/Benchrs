// Source de vérité unique pour les postes de jeu (clés courtes + libellés FR persistés).
//
// ⚠️ Ces libellés (POSITION_LABELS / POSITIONS) sont stockés tels quels en base
// dans `profiles.position` et `profiles.secondary_positions`. Ne JAMAIS modifier
// leurs valeurs ni leur ordre sans plan de migration de données.
//
// `src/lib/positions.ts` (module historique, consommé par settings/page.tsx) ré-exporte
// désormais `POSITIONS` depuis ce module afin qu'il n'existe qu'une seule source de
// vérité pour ces libellés et leur ordre.

export const POSITION_KEYS = [
  "GK",
  "DC",
  "LD",
  "LG",
  "MD",
  "MC",
  "MO",
  "AD",
  "AG",
  "BU",
] as const;

export type PositionKey = (typeof POSITION_KEYS)[number];

export const POSITION_LABELS: Record<PositionKey, string> = {
  GK: "Gardien",
  DC: "Défenseur central",
  LD: "Latéral droit",
  LG: "Latéral gauche",
  MD: "Milieu défensif",
  MC: "Milieu central",
  MO: "Milieu offensif",
  AD: "Ailier droit",
  AG: "Ailier gauche",
  BU: "Buteur",
};

// Libellés historiques persistés en base, dans l'ordre exact utilisé côté settings.
export const POSITIONS: string[] = POSITION_KEYS.map((k) => POSITION_LABELS[k]);

// Table inverse libellé -> clé, dérivée de POSITION_LABELS (une seule déclaration à maintenir).
const LABEL_TO_KEY: Record<string, PositionKey> = Object.fromEntries(
  POSITION_KEYS.map((k) => [POSITION_LABELS[k], k]),
) as Record<string, PositionKey>;

export function labelToKey(label: string | null | undefined): PositionKey | null {
  if (!label) return null;
  return LABEL_TO_KEY[label] ?? null;
}

// Ligne de jeu (regroupement macro), utilisée pour la classification/reporting.
// Note : autoCompose (lot 3) n'utilise PAS cette table pour un repli de compatibilité —
// un joueur reste strictement cantonné à son poste principal + ses postes secondaires.
export const POSITION_FAMILY: Record<PositionKey, "GK" | "DEF" | "MID" | "ATT"> = {
  GK: "GK",
  DC: "DEF",
  LD: "DEF",
  LG: "DEF",
  MD: "MID",
  MC: "MID",
  MO: "MID",
  AD: "ATT",
  AG: "ATT",
  BU: "ATT",
};
