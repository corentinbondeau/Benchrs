import type { PositionKey } from "./positions";

// Table des formations, déplacée depuis FeuilletMatchTab.tsx.
//
// 🔒 Invariant absolu : label/x/y sont strictement identiques aux valeurs d'origine
// (persistées en base dans `formations.formation_data`). Le champ `role` est purement
// additif et a été annoté slot par slot.
//
// Désambiguïsation du piège "Milieu D" / "Milieu G" (arbitrage utilisateur validé) :
//   - en 4-2-2-2 / 4-1-4-1 / 4-2-3-1, "Milieu D" désigne un milieu défensif => role: "MD"
//   - en 3-4-3 / 5-4-1, "Milieu D" / "Milieu G" désignent en réalité des couloirs
//     (positionnement large sur le terrain) => role: "AD" / "AG"

export interface SlotPos {
  x: number;
  y: number;
  label: string;
  role: PositionKey;
}

export const FORMATIONS: Record<string, SlotPos[]> = {
  "4-3-3": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 15, y: 70, label: "Arrière G", role: "LG" },
    { x: 38, y: 72, label: "Défenseur", role: "DC" },
    { x: 62, y: 72, label: "Défenseur", role: "DC" },
    { x: 85, y: 70, label: "Arrière D", role: "LD" },
    { x: 30, y: 48, label: "Milieu", role: "MC" },
    { x: 50, y: 45, label: "Milieu", role: "MC" },
    { x: 70, y: 48, label: "Milieu", role: "MC" },
    { x: 15, y: 25, label: "Ailier G", role: "AG" },
    { x: 50, y: 22, label: "Buteur", role: "BU" },
    { x: 85, y: 25, label: "Ailier D", role: "AD" },
  ],
  "4-4-2": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 15, y: 70, label: "Arrière G", role: "LG" },
    { x: 38, y: 72, label: "Défenseur", role: "DC" },
    { x: 62, y: 72, label: "Défenseur", role: "DC" },
    { x: 85, y: 70, label: "Arrière D", role: "LD" },
    { x: 15, y: 45, label: "Ailier G", role: "AG" },
    { x: 38, y: 48, label: "Milieu", role: "MC" },
    { x: 62, y: 48, label: "Milieu", role: "MC" },
    { x: 85, y: 45, label: "Ailier D", role: "AD" },
    { x: 38, y: 22, label: "Buteur", role: "BU" },
    { x: 62, y: 22, label: "Buteur", role: "BU" },
  ],
  "3-5-2": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 25, y: 72, label: "Défenseur", role: "DC" },
    { x: 50, y: 72, label: "Défenseur", role: "DC" },
    { x: 75, y: 72, label: "Défenseur", role: "DC" },
    { x: 10, y: 48, label: "Arrière G", role: "LG" },
    { x: 35, y: 48, label: "Milieu", role: "MC" },
    { x: 50, y: 42, label: "Milieu", role: "MC" },
    { x: 65, y: 48, label: "Milieu", role: "MC" },
    { x: 90, y: 48, label: "Arrière D", role: "LD" },
    { x: 38, y: 22, label: "Buteur", role: "BU" },
    { x: 62, y: 22, label: "Buteur", role: "BU" },
  ],
  "3-4-3": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 25, y: 72, label: "Défenseur", role: "DC" },
    { x: 50, y: 72, label: "Défenseur", role: "DC" },
    { x: 75, y: 72, label: "Défenseur", role: "DC" },
    // Couloir gauche en ligne de milieu -> ailier gauche (pas milieu défensif)
    { x: 10, y: 48, label: "Milieu G", role: "AG" },
    { x: 38, y: 48, label: "Milieu", role: "MC" },
    { x: 62, y: 48, label: "Milieu", role: "MC" },
    // Couloir droit en ligne de milieu -> ailier droit (pas milieu défensif)
    { x: 90, y: 48, label: "Milieu D", role: "AD" },
    { x: 25, y: 25, label: "Ailier G", role: "AG" },
    { x: 50, y: 20, label: "Buteur", role: "BU" },
    { x: 75, y: 25, label: "Ailier D", role: "AD" },
  ],
  "4-2-2-2": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 15, y: 70, label: "Arrière G", role: "LG" },
    { x: 38, y: 72, label: "Défenseur", role: "DC" },
    { x: 62, y: 72, label: "Défenseur", role: "DC" },
    { x: 85, y: 70, label: "Arrière D", role: "LD" },
    // Double pivot axial -> milieux défensifs
    { x: 35, y: 50, label: "Milieu D", role: "MD" },
    { x: 65, y: 50, label: "Milieu D", role: "MD" },
    { x: 32, y: 32, label: "Milieu O", role: "MO" },
    { x: 68, y: 32, label: "Milieu O", role: "MO" },
    { x: 38, y: 16, label: "Buteur", role: "BU" },
    { x: 62, y: 16, label: "Buteur", role: "BU" },
  ],
  "4-1-4-1": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 15, y: 70, label: "Arrière G", role: "LG" },
    { x: 38, y: 72, label: "Défenseur", role: "DC" },
    { x: 62, y: 72, label: "Défenseur", role: "DC" },
    { x: 85, y: 70, label: "Arrière D", role: "LD" },
    // Sentinelle unique devant la défense -> milieu défensif
    { x: 50, y: 55, label: "Milieu D", role: "MD" },
    { x: 18, y: 38, label: "Ailier G", role: "AG" },
    { x: 40, y: 36, label: "Milieu", role: "MC" },
    { x: 60, y: 36, label: "Milieu", role: "MC" },
    { x: 82, y: 38, label: "Ailier D", role: "AD" },
    { x: 50, y: 18, label: "Buteur", role: "BU" },
  ],
  "5-4-1": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 8, y: 70, label: "Arrière G", role: "LG" },
    { x: 27, y: 72, label: "Défenseur", role: "DC" },
    { x: 50, y: 72, label: "Défenseur", role: "DC" },
    { x: 73, y: 72, label: "Défenseur", role: "DC" },
    { x: 92, y: 70, label: "Arrière D", role: "LD" },
    // Couloirs en ligne de milieu (5-4-1) -> ailiers
    { x: 20, y: 45, label: "Milieu G", role: "AG" },
    { x: 42, y: 42, label: "Milieu", role: "MC" },
    { x: 58, y: 42, label: "Milieu", role: "MC" },
    { x: 80, y: 45, label: "Milieu D", role: "AD" },
    { x: 50, y: 18, label: "Buteur", role: "BU" },
  ],
  "4-2-3-1": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 15, y: 70, label: "Arrière G", role: "LG" },
    { x: 38, y: 72, label: "Défenseur", role: "DC" },
    { x: 62, y: 72, label: "Défenseur", role: "DC" },
    { x: 85, y: 70, label: "Arrière D", role: "LD" },
    // Double pivot axial -> milieux défensifs
    { x: 35, y: 52, label: "Milieu D", role: "MD" },
    { x: 65, y: 52, label: "Milieu D", role: "MD" },
    { x: 15, y: 35, label: "Ailier G", role: "AG" },
    { x: 50, y: 32, label: "Milieu O", role: "MO" },
    { x: 85, y: 35, label: "Ailier D", role: "AD" },
    { x: 50, y: 15, label: "Buteur", role: "BU" },
  ],
  "5-3-2": [
    { x: 50, y: 90, label: "Gardien", role: "GK" },
    { x: 10, y: 72, label: "Arrière G", role: "LG" },
    { x: 30, y: 72, label: "Défenseur", role: "DC" },
    { x: 50, y: 72, label: "Défenseur", role: "DC" },
    { x: 70, y: 72, label: "Défenseur", role: "DC" },
    { x: 90, y: 72, label: "Arrière D", role: "LD" },
    { x: 35, y: 45, label: "Milieu", role: "MC" },
    { x: 50, y: 42, label: "Milieu", role: "MC" },
    { x: 65, y: 45, label: "Milieu", role: "MC" },
    { x: 38, y: 22, label: "Buteur", role: "BU" },
    { x: 62, y: 22, label: "Buteur", role: "BU" },
  ],
};
