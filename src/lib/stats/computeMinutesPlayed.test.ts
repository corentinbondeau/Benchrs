import { describe, it, expect } from "vitest";
import { computeMinutesPlayed } from "./computeMinutesPlayed";

// Helper : fabrique un ISO string décalé de `minutesAgo` minutes par rapport à `base`
function minutesBefore(base: Date, minutesAgo: number): string {
  return new Date(base.getTime() - minutesAgo * 60_000).toISOString();
}

describe("computeMinutesPlayed", () => {
  // ─── P0 — Cas nominaux critiques ─────────────────────────────────────────

  it("joueur titulaire sans substitution → minutes = durée totale du match", () => {
    // Bug empêché : le titulaire reste crédité de 0 minutes au lieu de 90
    const start = new Date("2025-01-01T15:00:00Z");
    const end = new Date("2025-01-01T16:30:00Z");

    const result = computeMinutesPlayed(
      start.toISOString(),
      end.toISOString(),
      [],
      ["player1"]
    );

    expect(result.get("player1")).toBe(90);
  });

  it("joueur sorti à la minute 60 → ses minutes = 60", () => {
    // Bug empêché : joueur sorti crédité de 90 minutes (durée totale)
    const start = new Date("2025-01-01T15:00:00Z");
    const end = new Date("2025-01-01T16:30:00Z");

    const result = computeMinutesPlayed(
      start.toISOString(),
      end.toISOString(),
      [{ minute: 60, playerOut: "player1", playerIn: "player2" }],
      ["player1"]
    );

    expect(result.get("player1")).toBe(60);
  });

  it("joueur entrant à la minute 60 → ses minutes = 30 (durée totale - 60)", () => {
    // Bug empêché : remplaçant crédité de 0 ou 90 minutes au lieu de 30
    const start = new Date("2025-01-01T15:00:00Z");
    const end = new Date("2025-01-01T16:30:00Z");

    const result = computeMinutesPlayed(
      start.toISOString(),
      end.toISOString(),
      [{ minute: 60, playerOut: "player1", playerIn: "player2" }],
      ["player1"]
    );

    expect(result.get("player2")).toBe(30);
  });

  // ─── P1 — Dégradation gracieuse ──────────────────────────────────────────

  it("match non commencé (startedAt null) → Map vide", () => {
    // Bug empêché : stats calculées sur un match pas encore lancé
    const result = computeMinutesPlayed(null, null, [], ["player1"]);

    expect(result.size).toBe(0);
  });

  it("match en cours (endedAt null) → utilise le `now` fourni comme borne de fin", () => {
    // Bug empêché : minutes_played reste à 0 pendant un match en direct
    const now = new Date("2025-01-01T15:45:00Z");
    const start = minutesBefore(now, 45); // match commencé il y a 45 min

    const result = computeMinutesPlayed(
      start,
      null,
      [],
      ["player1"],
      now.getTime() // paramètre `now` pour la testabilité
    );

    expect(result.get("player1")).toBe(45);
  });

  it("aucun titulaire et aucune substitution → Map vide", () => {
    // Bug empêché : Map peuplée avec des joueurs fantômes sans données
    const result = computeMinutesPlayed(
      "2025-01-01T15:00:00Z",
      "2025-01-01T16:30:00Z",
      [],
      []
    );

    expect(result.size).toBe(0);
  });

  it("match terminé → durée complète du chrono, quel que soit le temps réel (avec pause mi-temps)", () => {
    // Match réel : 15:00 → mi-temps 15:30 → reprise 15:45 → fin 16:15
    // (temps réel effectif = 60 min, mais le chrono de match affiche 90')
    const result = computeMinutesPlayed(
      "2025-01-01T15:00:00Z",
      "2025-01-01T16:15:00Z",
      [],
      ["player1"],
      undefined,
      "2025-01-01T15:30:00Z",
      "2025-01-01T15:45:00Z"
    );
    expect(result.get("player1")).toBe(90);
  });

  it("2e mi-temps en cours → 1ère clôturée à 45 + temps de la 2e (chrono)", () => {
    // Début 15:00, mi-temps 15:30, reprise 15:40, maintenant 15:55 → 45 + 15
    const now = new Date("2025-01-01T15:55:00Z");
    const result = computeMinutesPlayed(
      "2025-01-01T15:00:00Z",
      null,
      [],
      ["player1"],
      now.getTime(),
      "2025-01-01T15:30:00Z",
      "2025-01-01T15:40:00Z"
    );
    expect(result.get("player1")).toBe(60);
  });

  it("1re mi-temps en cours → plafonné à la durée de mi-temps même si le temps réel dépasse", () => {
    // Bug empêché : temps de jeu basé sur le temps réel (50 min) au lieu du chrono (45')
    const now = new Date("2025-01-01T15:50:00Z");
    const start = new Date("2025-01-01T15:00:00Z");

    const result = computeMinutesPlayed(
      start.toISOString(),
      null,
      [],
      ["player1"],
      now.getTime()
    );

    expect(result.get("player1")).toBe(45);
  });

  it("respecte une durée de mi-temps personnalisée (format 5/7/8)", () => {
    // halfDuration = 25 → FULL = 50
    const start = new Date("2025-01-01T15:00:00Z");
    const end = new Date("2025-01-01T15:50:00Z");

    const result = computeMinutesPlayed(
      start.toISOString(),
      end.toISOString(),
      [],
      ["player1"],
      undefined,
      undefined,
      undefined,
      25
    );
    expect(result.get("player1")).toBe(50);
  });
});
