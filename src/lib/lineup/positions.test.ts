import { describe, it, expect } from "vitest";
import {
  POSITIONS,
  POSITION_KEYS,
  POSITION_LABELS,
  POSITION_FAMILY,
  labelToKey,
  type PositionKey,
} from "./positions";

/**
 * Contrat attendu (source d'autorité : TODO_fiche_joueur_composition.md, lot 1) :
 *
 *   export const POSITION_KEYS = ["GK","DC","LD","LG","MD","MC","MO","AD","AG","BU"] as const;
 *   export type PositionKey = (typeof POSITION_KEYS)[number];
 *   export const POSITION_LABELS: Record<PositionKey, string>;
 *   export const POSITIONS: string[]; // = POSITION_KEYS.map(k => POSITION_LABELS[k])
 *   export function labelToKey(label: string | null | undefined): PositionKey | null;
 *   export const POSITION_FAMILY: Record<PositionKey, "GK" | "DEF" | "MID" | "ATT">;
 *
 * Ce fichier ne teste PAS la table COMPATIBILITY : d'après l'arbitrage utilisateur validé
 * (voir briefing @test), l'algorithme autoCompose (lot 3) n'utilise PLUS de repli par
 * compatibilité — un joueur n'est jamais placé hors de son périmètre de postes
 * (position principale + postes secondaires). COMPATIBILITY, si @dev l'ajoute quand même,
 * reste hors du périmètre testé ici.
 */

// Libellés historiques persistés en base (profiles.position / profiles.secondary_positions).
// Toute rupture de cette liste corrompt des données existantes : c'est le test qui compte.
const HISTORICAL_POSITIONS = [
  "Gardien",
  "Défenseur central",
  "Latéral droit",
  "Latéral gauche",
  "Piston droit",
  "Piston gauche",
  "Milieu défensif",
  "Milieu central",
  "Milieu offensif",
  "Ailier droit",
  "Ailier gauche",
  "Buteur",
];

describe("POSITIONS — anti-corruption des données en base", () => {
  it("est strictement égal (valeurs ET ordre) aux 12 libellés historiques", () => {
    expect(POSITIONS).toEqual(HISTORICAL_POSITIONS);
  });
});

describe("POSITION_KEYS / POSITION_LABELS — bijection", () => {
  it("contient exactement 12 clés, sans doublon", () => {
    expect(POSITION_KEYS.length).toBe(12);
    expect(new Set(POSITION_KEYS).size).toBe(12);
  });

  it("chaque clé possède un libellé, et chaque libellé historique a une clé", () => {
    const labels = POSITION_KEYS.map((k) => POSITION_LABELS[k]);
    // Aucune clé sans libellé (pas d'entrée undefined)
    expect(labels.every((l) => typeof l === "string" && l.length > 0)).toBe(true);
    // Aucun libellé orphelin : chaque libellé historique est couvert par une clé
    for (const label of HISTORICAL_POSITIONS) {
      expect(labels).toContain(label);
    }
    // Bijection stricte : mêmes ensembles, sans doublon de libellé
    expect(new Set(labels).size).toBe(12);
  });
});

describe("POSITION_FAMILY — ligne de jeu (garant du regroupement gardien/défenseur/milieu/attaquant)", () => {
  it("classe chaque poste dans exactement une famille parmi GK/DEF/MID/ATT", () => {
    for (const key of POSITION_KEYS) {
      expect(["GK", "DEF", "MID", "ATT"]).toContain(POSITION_FAMILY[key]);
    }
  });

  it("place le gardien seul dans la famille GK", () => {
    const gkFamilyMembers = POSITION_KEYS.filter((k) => POSITION_FAMILY[k] === "GK");
    expect(gkFamilyMembers).toEqual(["GK"]);
  });

  it("regroupe les postes défensifs (latéraux + pistons + défenseur central) dans DEF", () => {
    expect(POSITION_FAMILY["DC"]).toBe("DEF");
    expect(POSITION_FAMILY["LD"]).toBe("DEF");
    expect(POSITION_FAMILY["LG"]).toBe("DEF");
    expect(POSITION_FAMILY["PD"]).toBe("DEF");
    expect(POSITION_FAMILY["PG"]).toBe("DEF");
  });

  it("regroupe les postes offensifs (ailiers + buteur) dans ATT", () => {
    expect(POSITION_FAMILY["AD"]).toBe("ATT");
    expect(POSITION_FAMILY["AG"]).toBe("ATT");
    expect(POSITION_FAMILY["BU"]).toBe("ATT");
  });
});

describe("labelToKey — résolution libellé -> clé", () => {
  it("résout un libellé exact vers sa clé", () => {
    expect(labelToKey("Milieu défensif")).toBe("MD");
  });

  it("retourne null pour un libellé inconnu", () => {
    expect(labelToKey("inconnu")).toBeNull();
  });

  it("retourne null pour une entrée vide/absente (robustesse données terrain)", () => {
    expect(labelToKey(null)).toBeNull();
    expect(labelToKey(undefined)).toBeNull();
    expect(labelToKey("")).toBeNull();
  });
});

// Garde-fou de typage : PositionKey doit être utilisable comme type discriminant simple.
describe("PositionKey — usage comme type", () => {
  it("chaque clé de POSITION_KEYS est assignable à PositionKey", () => {
    const sample: PositionKey = POSITION_KEYS[0];
    expect(POSITION_KEYS).toContain(sample);
  });
});
