import { describe, it, expect } from "vitest";
import { filterActiveTrainingIds } from "./filterActiveTrainingIds";

describe("filterActiveTrainingIds", () => {
  // P0 — cas nominaux critiques

  it("exclut un training cancelled", () => {
    // Bug empêché : entraînement annulé comptabilisé dans l'assiduité/leaderboard
    const result = filterActiveTrainingIds([
      { id: "1", type: "training", status: "cancelled" },
    ]);
    expect(result).toEqual([]);
  });

  it("inclut un training completed", () => {
    const result = filterActiveTrainingIds([
      { id: "1", type: "training", status: "completed" },
    ]);
    expect(result).toEqual(["1"]);
  });

  it("inclut un training upcoming", () => {
    const result = filterActiveTrainingIds([
      { id: "2", type: "training", status: "upcoming" },
    ]);
    expect(result).toEqual(["2"]);
  });

  it("exclut un match quel que soit son status", () => {
    // Bug empêché : les matchs ne sont pas des entraînements et ne doivent pas
    // entrer dans le calcul d'assiduité aux entraînements
    const result = filterActiveTrainingIds([
      { id: "3", type: "match", status: "completed" },
    ]);
    expect(result).toEqual([]);
  });

  // P1 — dégradation gracieuse

  it("retourne un tableau vide pour une liste d'événements vide", () => {
    expect(filterActiveTrainingIds([])).toEqual([]);
  });

  it("ne retourne que les ids des trainings non-cancelled dans un mélange d'events", () => {
    // Intégration complète : cancelled exclu, match exclu, completed retenu
    const events = [
      { id: "10", type: "training", status: "cancelled" },
      { id: "11", type: "training", status: "completed" },
      { id: "12", type: "match", status: "completed" },
    ];
    expect(filterActiveTrainingIds(events)).toEqual(["11"]);
  });
});
