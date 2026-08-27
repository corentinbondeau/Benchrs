import { describe, it, expect } from "vitest";
import { FORMATIONS } from "./formations";
import { POSITION_KEYS } from "./positions";

/**
 * Contrat attendu (TODO, lot 2) :
 *   interface SlotPos { x: number; y: number; label: string; role: PositionKey; }
 *   export const FORMATIONS: Record<string, SlotPos[]>;
 *
 * 🔒 Invariant absolu : les `label`/`x`/`y` sont persistés en base (formations.formation_data).
 * Ce fichier fige un snapshot littéral lisible de ces valeurs — toute modification
 * accidentelle (renommage, réordonnancement, typo) doit faire échouer ce test.
 *
 * Le champ `role` est purement additif et porte l'arbitrage sportif suivant (validé par
 * l'utilisateur, remplace la table du TODO pour les couloirs) :
 *   - "Milieu D" en 4-2-2-2 / 4-1-4-1 / 4-2-3-1 => MD (milieu défensif)
 *   - "Milieu D" en 3-4-3 / 5-4-1              => AD (couloir droit -> ailier droit)
 *   - "Milieu G" en 3-4-3 / 5-4-1              => AG (couloir gauche -> ailier gauche)
 */

// Snapshot figé : [label, x, y, role] par slot, dans l'ordre exact du fichier source.
// (Extrait à l'identique de FeuilletMatchTab.tsx l.68-186 au moment de l'écriture des tests.)
const EXPECTED_SLOTS: Record<string, Array<[string, number, number, string]>> = {
  "4-3-3": [
    ["Gardien", 50, 90, "GK"],
    ["Arrière G", 15, 70, "LG"],
    ["Défenseur", 38, 72, "DC"],
    ["Défenseur", 62, 72, "DC"],
    ["Arrière D", 85, 70, "LD"],
    ["Milieu", 30, 48, "MC"],
    ["Milieu", 50, 45, "MC"],
    ["Milieu", 70, 48, "MC"],
    ["Ailier G", 15, 25, "AG"],
    ["Buteur", 50, 22, "BU"],
    ["Ailier D", 85, 25, "AD"],
  ],
  "4-4-2": [
    ["Gardien", 50, 90, "GK"],
    ["Arrière G", 15, 70, "LG"],
    ["Défenseur", 38, 72, "DC"],
    ["Défenseur", 62, 72, "DC"],
    ["Arrière D", 85, 70, "LD"],
    ["Ailier G", 15, 45, "AG"],
    ["Milieu", 38, 48, "MC"],
    ["Milieu", 62, 48, "MC"],
    ["Ailier D", 85, 45, "AD"],
    ["Buteur", 38, 22, "BU"],
    ["Buteur", 62, 22, "BU"],
  ],
  "3-5-2": [
    ["Gardien", 50, 90, "GK"],
    ["Défenseur", 25, 72, "DC"],
    ["Défenseur", 50, 72, "DC"],
    ["Défenseur", 75, 72, "DC"],
    ["Arrière G", 10, 48, "LG"],
    ["Milieu", 35, 48, "MC"],
    ["Milieu", 50, 42, "MC"],
    ["Milieu", 65, 48, "MC"],
    ["Arrière D", 90, 48, "LD"],
    ["Buteur", 38, 22, "BU"],
    ["Buteur", 62, 22, "BU"],
  ],
  "3-4-3": [
    ["Gardien", 50, 90, "GK"],
    ["Défenseur", 25, 72, "DC"],
    ["Défenseur", 50, 72, "DC"],
    ["Défenseur", 75, 72, "DC"],
    ["Milieu G", 10, 48, "AG"],
    ["Milieu", 38, 48, "MC"],
    ["Milieu", 62, 48, "MC"],
    ["Milieu D", 90, 48, "AD"],
    ["Ailier G", 25, 25, "AG"],
    ["Buteur", 50, 20, "BU"],
    ["Ailier D", 75, 25, "AD"],
  ],
  "4-2-2-2": [
    ["Gardien", 50, 90, "GK"],
    ["Arrière G", 15, 70, "LG"],
    ["Défenseur", 38, 72, "DC"],
    ["Défenseur", 62, 72, "DC"],
    ["Arrière D", 85, 70, "LD"],
    ["Milieu D", 35, 50, "MD"],
    ["Milieu D", 65, 50, "MD"],
    ["Milieu O", 32, 32, "MO"],
    ["Milieu O", 68, 32, "MO"],
    ["Buteur", 38, 16, "BU"],
    ["Buteur", 62, 16, "BU"],
  ],
  "4-1-4-1": [
    ["Gardien", 50, 90, "GK"],
    ["Arrière G", 15, 70, "LG"],
    ["Défenseur", 38, 72, "DC"],
    ["Défenseur", 62, 72, "DC"],
    ["Arrière D", 85, 70, "LD"],
    ["Milieu D", 50, 55, "MD"],
    ["Ailier G", 18, 38, "AG"],
    ["Milieu", 40, 36, "MC"],
    ["Milieu", 60, 36, "MC"],
    ["Ailier D", 82, 38, "AD"],
    ["Buteur", 50, 18, "BU"],
  ],
  "5-4-1": [
    ["Gardien", 50, 90, "GK"],
    ["Arrière G", 8, 70, "LG"],
    ["Défenseur", 27, 72, "DC"],
    ["Défenseur", 50, 72, "DC"],
    ["Défenseur", 73, 72, "DC"],
    ["Arrière D", 92, 70, "LD"],
    ["Milieu G", 20, 45, "AG"],
    ["Milieu", 42, 42, "MC"],
    ["Milieu", 58, 42, "MC"],
    ["Milieu D", 80, 45, "AD"],
    ["Buteur", 50, 18, "BU"],
  ],
  "4-2-3-1": [
    ["Gardien", 50, 90, "GK"],
    ["Arrière G", 15, 70, "LG"],
    ["Défenseur", 38, 72, "DC"],
    ["Défenseur", 62, 72, "DC"],
    ["Arrière D", 85, 70, "LD"],
    ["Milieu D", 35, 52, "MD"],
    ["Milieu D", 65, 52, "MD"],
    ["Ailier G", 15, 35, "AG"],
    ["Milieu O", 50, 32, "MO"],
    ["Ailier D", 85, 35, "AD"],
    ["Buteur", 50, 15, "BU"],
  ],
  "5-3-2": [
    ["Gardien", 50, 90, "GK"],
    ["Arrière G", 10, 72, "LG"],
    ["Défenseur", 30, 72, "DC"],
    ["Défenseur", 50, 72, "DC"],
    ["Défenseur", 70, 72, "DC"],
    ["Arrière D", 90, 72, "LD"],
    ["Milieu", 35, 45, "MC"],
    ["Milieu", 50, 42, "MC"],
    ["Milieu", 65, 45, "MC"],
    ["Buteur", 38, 22, "BU"],
    ["Buteur", 62, 22, "BU"],
  ],
};

const FORMATION_NAMES = Object.keys(EXPECTED_SLOTS);

describe("FORMATIONS — non-régression des données persistées (label/x/y)", () => {
  it("expose exactement les 9 formations attendues", () => {
    expect(Object.keys(FORMATIONS).sort()).toEqual(FORMATION_NAMES.sort());
  });

  for (const name of FORMATION_NAMES) {
    it(`"${name}" : 11 slots, [label, x, y, role] inchangés`, () => {
      const slots = FORMATIONS[name];
      expect(slots).toBeDefined();
      expect(slots.length).toBe(11);
      const actual = slots.map((s) => [s.label, s.x, s.y, s.role]);
      expect(actual).toEqual(EXPECTED_SLOTS[name]);
    });
  }
});

describe("FORMATIONS — complétude du champ role", () => {
  it("compte 99 slots au total (9 formations x 11)", () => {
    const total = FORMATION_NAMES.reduce((acc, name) => acc + FORMATIONS[name].length, 0);
    expect(total).toBe(99);
  });

  it("chaque slot des 9 formations a un role appartenant à POSITION_KEYS", () => {
    for (const name of FORMATION_NAMES) {
      for (const slot of FORMATIONS[name]) {
        expect(POSITION_KEYS).toContain(slot.role);
      }
    }
  });
});

describe("FORMATIONS — unicité et position du gardien", () => {
  for (const name of FORMATION_NAMES) {
    it(`"${name}" : exactement un slot GK, à l'index 0`, () => {
      const slots = FORMATIONS[name];
      const gkSlots = slots.filter((s) => s.role === "GK");
      expect(gkSlots.length).toBe(1);
      expect(slots[0].role).toBe("GK");
    });
  }
});

describe("FORMATIONS — désambiguïsation du piège 'Milieu D' / 'Milieu G'", () => {
  it("'Milieu D' vaut milieu défensif (MD) en 4-2-2-2 / 4-1-4-1 / 4-2-3-1", () => {
    for (const name of ["4-2-2-2", "4-1-4-1", "4-2-3-1"]) {
      const milieuDSlots = FORMATIONS[name].filter((s) => s.label === "Milieu D");
      expect(milieuDSlots.length).toBeGreaterThan(0);
      for (const slot of milieuDSlots) {
        expect(slot.role).toBe("MD");
      }
    }
  });

  it("'Milieu D' vaut ailier droit (AD, couloir) en 3-4-3 / 5-4-1", () => {
    for (const name of ["3-4-3", "5-4-1"]) {
      const milieuDSlots = FORMATIONS[name].filter((s) => s.label === "Milieu D");
      expect(milieuDSlots.length).toBe(1);
      expect(milieuDSlots[0].role).toBe("AD");
    }
  });

  it("'Milieu G' vaut ailier gauche (AG, couloir) en 3-4-3 / 5-4-1", () => {
    for (const name of ["3-4-3", "5-4-1"]) {
      const milieuGSlots = FORMATIONS[name].filter((s) => s.label === "Milieu G");
      expect(milieuGSlots.length).toBe(1);
      expect(milieuGSlots[0].role).toBe("AG");
    }
  });
});
