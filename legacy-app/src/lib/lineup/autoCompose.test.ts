import { describe, it, expect } from "vitest";
import { autoCompose, type ComposablePlayer, type ComposableSlot } from "./autoCompose";

/**
 * Contrat attendu (TODO lot 3, RÉVISÉ par arbitrage utilisateur explicite — voir briefing) :
 *
 *   export interface ComposablePlayer {
 *     id: string;
 *     position?: string | null;
 *     secondary_positions?: string[] | null;
 *   }
 *   export interface ComposableSlot { role: PositionKey }
 *   export interface AutoComposeInput {
 *     slots: ComposableSlot[];
 *     players: ComposablePlayer[];
 *     benchSize: number;
 *   }
 *   export interface AutoComposeResult {
 *     assignments: Record<string, string>; // "slot-i" -> playerId ; PAS de clé si le slot est vide
 *     bench: Record<string, string>;       // "bench-i" -> playerId
 *     unassigned: string[];                // surplus au-delà du banc
 *   }
 *   export function autoCompose(input: AutoComposeInput): AutoComposeResult;
 *
 * 🔒 RÈGLE MÉTIER ARBITRÉE (remplace le TODO d'origine, qui proposait de remplir le slot à
 * tout prix + `lowConfidenceSlots`) :
 *   Un joueur n'est JAMAIS placé sur un slot hors de son périmètre de postes
 *   (position principale OU un poste de secondary_positions). Pas de repli par
 *   "compatibilité" / famille de ligne. Si aucun joueur présent ne correspond au poste
 *   d'un slot, CE SLOT RESTE VIDE (aucune clé "slot-i" dans `assignments`) et les joueurs
 *   non placés partent au banc. `lowConfidenceSlots` n'existe plus dans le contrat.
 *
 * Priorité de résolution : poste principal > poste secondaire, à score égal départage par
 * `player.id` (ordre croissant) pour garantir un résultat déterministe et indépendant de
 * l'ordre d'entrée. Le gardien (slot role "GK") est résolu en priorité absolue.
 * `preferred_foot` n'existe même pas dans `ComposablePlayer` : il ne peut donc pas influencer
 * le résultat (verrou structurel de l'exclusion demandée).
 *
 * Aucun import Supabase / React dans autoCompose.ts : fonction pure.
 */

function player(
  id: string,
  position: string | null,
  secondary: string[] | null = null,
): ComposablePlayer {
  return { id, position, secondary_positions: secondary };
}

// Invariant transverse réutilisé par plusieurs tests : aucun joueur titulaire ET remplaçant,
// aucun joueur sur deux slots / deux places de banc.
function assertNoDuplicatePlacement(result: {
  assignments: Record<string, string>;
  bench: Record<string, string>;
}) {
  const placed = [...Object.values(result.assignments), ...Object.values(result.bench)];
  expect(new Set(placed).size).toBe(placed.length);
}

describe("autoCompose — cas nominal", () => {
  it("place chaque joueur sur son poste principal quand il correspond exactement à un slot (4-3-3)", () => {
    const slots: ComposableSlot[] = [
      { role: "GK" },
      { role: "LG" },
      { role: "DC" },
      { role: "DC" },
      { role: "LD" },
      { role: "MC" },
      { role: "MC" },
      { role: "MC" },
      { role: "AG" },
      { role: "BU" },
      { role: "AD" },
    ];
    const players: ComposablePlayer[] = [
      player("p-gk", "Gardien"),
      player("p-lg", "Latéral gauche"),
      player("p-dc1", "Défenseur central"),
      player("p-dc2", "Défenseur central"),
      player("p-ld", "Latéral droit"),
      player("p-mc1", "Milieu central"),
      player("p-mc2", "Milieu central"),
      player("p-mc3", "Milieu central"),
      player("p-ag", "Ailier gauche"),
      player("p-bu", "Buteur"),
      player("p-ad", "Ailier droit"),
    ];

    const result = autoCompose({ slots, players, benchSize: 0 });

    expect(Object.keys(result.assignments).length).toBe(11);
    expect(Object.values(result.assignments).sort()).toEqual(
      players.map((p) => p.id).sort(),
    );
    expect(result.bench).toEqual({});
    expect(result.unassigned).toEqual([]);
    // Contrôle ciblé sur les postes non dupliqués (GK, LG, LD, AG, BU, AD)
    expect(result.assignments["slot-0"]).toBe("p-gk");
    expect(result.assignments["slot-1"]).toBe("p-lg");
    expect(result.assignments["slot-4"]).toBe("p-ld");
    expect(result.assignments["slot-8"]).toBe("p-ag");
    expect(result.assignments["slot-9"]).toBe("p-bu");
    expect(result.assignments["slot-10"]).toBe("p-ad");
  });
});

describe("autoCompose — gardien prioritaire", () => {
  it("place l'unique gardien sur slot-0 même s'il est en dernière position dans le tableau d'entrée", () => {
    const slots: ComposableSlot[] = [{ role: "GK" }, { role: "MC" }, { role: "MC" }];
    const players: ComposablePlayer[] = [
      player("p-mc1", "Milieu central"),
      player("p-mc2", "Milieu central"),
      player("p-gk", "Gardien"),
    ];

    const result = autoCompose({ slots, players, benchSize: 0 });

    expect(result.assignments["slot-0"]).toBe("p-gk");
    assertNoDuplicatePlacement(result);
  });

  it("laisse slot-0 vide quand aucun gardien n'est présent (nouvelle règle : jamais de repli par un joueur de champ)", () => {
    const slots: ComposableSlot[] = [{ role: "GK" }, { role: "MC" }];
    const players: ComposablePlayer[] = [player("p-mc1", "Milieu central")];

    const result = autoCompose({ slots, players, benchSize: 0 });

    expect(result.assignments["slot-0"]).toBeUndefined();
    expect(result.assignments["slot-1"]).toBe("p-mc1");
  });

  it("avec deux gardiens présents, un seul titulaire (le plus petit id), l'autre part au banc", () => {
    const slots: ComposableSlot[] = [{ role: "GK" }];
    const players: ComposablePlayer[] = [player("p-gk-b", "Gardien"), player("p-gk-a", "Gardien")];

    const result = autoCompose({ slots, players, benchSize: 1 });

    expect(result.assignments["slot-0"]).toBe("p-gk-a");
    expect(Object.values(result.bench)).toEqual(["p-gk-b"]);
    assertNoDuplicatePlacement(result);
  });
});

describe("autoCompose — priorité poste principal > poste secondaire", () => {
  it("le joueur en poste principal l'emporte sur celui en poste secondaire, quel que soit l'ordre d'entrée", () => {
    const slots: ComposableSlot[] = [{ role: "AD" }, { role: "MC" }];

    const runWith = (players: ComposablePlayer[]) => autoCompose({ slots, players, benchSize: 1 });

    const secondaryFirst = runWith([
      player("p-secondary", "Milieu central", ["Ailier droit"]),
      player("p-principal", "Ailier droit"),
    ]);
    const principalFirst = runWith([
      player("p-principal", "Ailier droit"),
      player("p-secondary", "Milieu central", ["Ailier droit"]),
    ]);

    for (const result of [secondaryFirst, principalFirst]) {
      expect(result.assignments["slot-0"]).toBe("p-principal");
      expect(result.assignments["slot-1"]).toBe("p-secondary");
      assertNoDuplicatePlacement(result);
    }
  });
});

describe("autoCompose — aucun candidat pour un poste (règle arbitrée : slot vide)", () => {
  it("laisse le slot vide quand aucun joueur ne correspond (principal ou secondaire), le joueur restant va au banc", () => {
    const slots: ComposableSlot[] = [{ role: "MD" }, { role: "BU" }];
    const players: ComposablePlayer[] = [player("p-bu", "Buteur"), player("p-ag", "Ailier gauche")];

    const result = autoCompose({ slots, players, benchSize: 2 });

    expect(result.assignments["slot-0"]).toBeUndefined(); // aucun MD/compatible
    expect(result.assignments["slot-1"]).toBe("p-bu");
    expect(Object.values(result.bench)).toContain("p-ag");
    expect(result.unassigned).toEqual([]);
    assertNoDuplicatePlacement(result);
  });
});

describe("autoCompose — effectifs dégradés", () => {
  it("effectif < nombre de slots : pas de crash, slots excédentaires vides, unassigned vide", () => {
    const slots: ComposableSlot[] = [{ role: "GK" }, { role: "DC" }, { role: "BU" }];
    const players: ComposablePlayer[] = [player("p-gk", "Gardien")];

    const result = autoCompose({ slots, players, benchSize: 0 });

    expect(result.assignments["slot-0"]).toBe("p-gk");
    expect(Object.keys(result.assignments).length).toBe(1);
    expect(result.unassigned).toEqual([]);
  });

  it("effectif > slots + banc : le surplus est non retenu, sans doublon", () => {
    const slots: ComposableSlot[] = [{ role: "GK" }];
    const players: ComposablePlayer[] = [
      player("p-gk", "Gardien"),
      player("p-a", "Milieu central"),
      player("p-b", "Buteur"),
    ];

    const result = autoCompose({ slots, players, benchSize: 1 });

    expect(result.assignments["slot-0"]).toBe("p-gk");
    expect(Object.keys(result.bench).length).toBe(1);
    expect(result.unassigned.length).toBe(1);
    assertNoDuplicatePlacement(result);
    const placedOrUnassigned = [
      ...Object.values(result.assignments),
      ...Object.values(result.bench),
      ...result.unassigned,
    ];
    expect(new Set(placedOrUnassigned).size).toBe(3);
  });

  it("joueurs sans position ni secondary_positions : pas de crash, ils ne squattent aucun poste", () => {
    const slots: ComposableSlot[] = [{ role: "GK" }, { role: "BU" }];
    const players: ComposablePlayer[] = [
      player("p-none", null, null),
      player("p-bu", "Buteur"),
    ];

    const result = autoCompose({ slots, players, benchSize: 1 });

    expect(result.assignments["slot-1"]).toBe("p-bu");
    expect(result.assignments["slot-0"]).toBeUndefined();
    expect(Object.values(result.bench)).toContain("p-none");
  });
});

describe("autoCompose — déterminisme", () => {
  const slots: ComposableSlot[] = [{ role: "GK" }, { role: "MC" }, { role: "MC" }, { role: "BU" }];
  const players: ComposablePlayer[] = [
    player("p3", "Milieu central"),
    player("p1", "Gardien"),
    player("p4", "Buteur"),
    player("p2", "Milieu central"),
  ];

  it("deux appels identiques donnent un résultat rigoureusement identique", () => {
    const r1 = autoCompose({ slots, players, benchSize: 0 });
    const r2 = autoCompose({ slots, players, benchSize: 0 });
    expect(r1).toEqual(r2);
  });

  it("l'ordre d'entrée des joueurs n'influence pas le résultat (départage stable par id)", () => {
    const forward = autoCompose({ slots, players, benchSize: 0 });
    const reversed = autoCompose({ slots, players: [...players].reverse(), benchSize: 0 });
    expect(forward).toEqual(reversed);
  });
});

describe("autoCompose — non-régression : preferred_foot exclu de l'algorithme", () => {
  it("ComposablePlayer n'a pas de champ preferred_foot exploitable : deux joueurs ne différant que par un attribut hors contrat donnent le même résultat", () => {
    const slots: ComposableSlot[] = [{ role: "AD" }];
    const base = { id: "p-a", position: "Ailier droit", secondary_positions: null };
    // On simule un payload qui contiendrait malgré tout preferred_foot (ex. objet plus riche
    // que ComposablePlayer côté appelant) : le contrat autoCompose ne doit rien en lire.
    const withFoot = { ...base, preferred_foot: "Gauche" } as ComposablePlayer;
    const withoutFoot = { ...base } as ComposablePlayer;

    const r1 = autoCompose({ slots, players: [withFoot], benchSize: 0 });
    const r2 = autoCompose({ slots, players: [withoutFoot], benchSize: 0 });

    expect(r1).toEqual(r2);
  });
});
