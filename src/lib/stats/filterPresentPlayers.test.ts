import { describe, it, expect } from "vitest";
import { filterPresentPlayers } from "./filterPresentPlayers";

interface Profile {
  id: string;
  [key: string]: unknown;
}

interface PlayerAttendanceRow {
  profile: Profile;
  status: "present" | "late" | "absent" | "excused" | "pending" | null;
}

describe("filterPresentPlayers", () => {
  // P0 — cas nominaux critiques

  it("inclut un joueur avec status present", () => {
    // Bug empêché : joueur présent exclu du live/stats
    const player: Profile = { id: "p1" };
    const matchPlayers: PlayerAttendanceRow[] = [{ profile: player, status: "present" }];

    const result = filterPresentPlayers([player], matchPlayers);

    expect(result).toEqual([player]);
  });

  it("inclut un joueur avec status late", () => {
    // Bug empêché : joueur en retard exclu du live/stats
    const player: Profile = { id: "p2" };
    const matchPlayers: PlayerAttendanceRow[] = [{ profile: player, status: "late" }];

    const result = filterPresentPlayers([player], matchPlayers);

    expect(result).toEqual([player]);
  });

  it("exclut un joueur avec status absent", () => {
    // Bug empêché : joueur absent apparaît dans les sélecteurs du live
    const player: Profile = { id: "p3" };
    const matchPlayers: PlayerAttendanceRow[] = [{ profile: player, status: "absent" }];

    const result = filterPresentPlayers([player], matchPlayers);

    expect(result).toEqual([]);
  });

  it("exclut un joueur avec status pending", () => {
    // Bug empêché : joueur non confirmé apparaît dans les sélecteurs du live
    const player: Profile = { id: "p4" };
    const matchPlayers: PlayerAttendanceRow[] = [{ profile: player, status: "pending" }];

    const result = filterPresentPlayers([player], matchPlayers);

    expect(result).toEqual([]);
  });

  it("exclut un joueur présent dans allPlayers mais absent de matchPlayers", () => {
    // Bug empêché : joueur non convoqué apparaît dans le live
    const player: Profile = { id: "p5" };

    const result = filterPresentPlayers([player], []);

    expect(result).toEqual([]);
  });

  // P1 — dégradation gracieuse

  it("retourne un tableau vide quand allPlayers est vide", () => {
    const matchPlayers: PlayerAttendanceRow[] = [
      { profile: { id: "p6" }, status: "present" },
    ];

    const result = filterPresentPlayers([], matchPlayers);

    expect(result).toEqual([]);
  });
});
