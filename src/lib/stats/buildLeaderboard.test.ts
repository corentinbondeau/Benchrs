import { describe, it, expect } from "vitest";
import { buildLeaderboard } from "./buildLeaderboard";
import type { RosterPlayer, MatchStatRow, AttendanceRow } from "./buildLeaderboard";

const roster: RosterPlayer[] = [
  { player_id: "p1", first_name: "Alice", last_name: "Martin", shirt_number: 10 },
  { player_id: "p2", first_name: "Bob", last_name: "Durand", shirt_number: 7 },
];

const trainingIds = ["t1", "t2"];

describe("buildLeaderboard", () => {
  it("affiche tous les joueurs du roster même sans aucun match (assiduité seule)", () => {
    const attendances: AttendanceRow[] = [
      { user_id: "p1", event_id: "t1", status: "present" },
      { user_id: "p1", event_id: "t2", status: "late" },
      { user_id: "p2", event_id: "t1", status: "absent" },
      { user_id: "p2", event_id: "t2", status: "absent" },
    ];
    const result = buildLeaderboard(roster, [], attendances, trainingIds);

    expect(result).toHaveLength(2);
    const alice = result.find((e) => e.player_id === "p1")!;
    const bob = result.find((e) => e.player_id === "p2")!;

    expect(alice.attendance_rate).toBe(100); // present + late
    expect(bob.attendance_rate).toBe(0);
    expect(alice.matches_played).toBe(0);
    expect(alice.trainings_count).toBe(2);
    expect(bob.trainings_count).toBe(2);
  });

  it("calcule l'assiduité sur les entraînements uniquement, jamais les matchs", () => {
    const attendances: AttendanceRow[] = [
      // p1 absent aux entraînements mais présent à un match (m1 non listé dans trainingIds)
      { user_id: "p1", event_id: "t1", status: "absent" },
      { user_id: "p1", event_id: "m1", status: "present" },
    ];
    const result = buildLeaderboard(roster, [], attendances, trainingIds);
    const alice = result.find((e) => e.player_id === "p1")!;
    expect(alice.attendance_rate).toBe(0); // le match ne compte pas
    expect(alice.trainings_count).toBe(1); // seule t1 est un training
  });

  it("agrège correctement les stats de match par joueur", () => {
    const matchStats: MatchStatRow[] = [
      { player_id: "p1", goals: 2, assists: 1, minutes_played: 90 },
      { player_id: "p1", goals: 1, assists: 0, minutes_played: 80, yellow_cards: 1 },
      { player_id: "p2", goals: 0, assists: 3, minutes_played: 70 },
    ];
    const result = buildLeaderboard(roster, matchStats, [], trainingIds);
    const alice = result.find((e) => e.player_id === "p1")!;
    const bob = result.find((e) => e.player_id === "p2")!;

    expect(alice.goals).toBe(3);
    expect(alice.assists).toBe(1);
    expect(alice.minutes_played).toBe(170);
    expect(alice.yellow_cards).toBe(1);
    expect(alice.matches_played).toBe(2);
    expect(bob.assists).toBe(3);
    expect(bob.matches_played).toBe(1);
  });

  it("inclut un joueur du roster sans aucune donnée, à zéro", () => {
    const result = buildLeaderboard(roster, [], [], trainingIds);
    const bob = result.find((e) => e.player_id === "p2")!;
    expect(bob.goals).toBe(0);
    expect(bob.matches_played).toBe(0);
    expect(bob.trainings_count).toBe(0);
    expect(bob.attendance_rate).toBe(0); // pas de convocation → 0 affiché
  });

  it("attendance_rate = 0 quand des convocations existent mais aucune présence", () => {
    const attendances: AttendanceRow[] = [
      { user_id: "p1", event_id: "t1", status: "absent" },
      { user_id: "p1", event_id: "t2", status: "excused" },
    ];
    const result = buildLeaderboard(roster, [], attendances, trainingIds);
    const alice = result.find((e) => e.player_id === "p1")!;
    expect(alice.attendance_rate).toBe(0);
    expect(alice.trainings_count).toBe(2);
  });

  it("ne crée pas d'entrée pour un joueur absent du roster même s'il a des stats", () => {
    const matchStats: MatchStatRow[] = [{ player_id: "ghost", goals: 5 }];
    const result = buildLeaderboard(roster, matchStats, [], trainingIds);
    expect(result.find((e) => e.player_id === "ghost")).toBeUndefined();
    expect(result).toHaveLength(2);
  });
});
