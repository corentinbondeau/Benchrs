import { describe, it, expect } from "vitest";
import { computeAttendanceRate } from "./computeAttendanceRate";

describe("computeAttendanceRate", () => {
  const trainingIds = ["t1", "t2", "t3", "t4"];

  it("ne compte que les attendances des entraînements (ignore les matchs)", () => {
    const attendances = [
      { event_id: "t1", status: "present" },
      { event_id: "t2", status: "present" },
      { event_id: "m1", status: "absent" }, // match → ignoré
      { event_id: "m2", status: "absent" }, // match → ignoré
    ];
    // 2 présents sur 2 entraînements pris en compte → 100
    expect(computeAttendanceRate(attendances, trainingIds)).toBe(100);
  });

  it("retourne 0 si absent à tous les entraînements (même présent aux matchs)", () => {
    const attendances = [
      { event_id: "t1", status: "absent" },
      { event_id: "t2", status: "excused" },
      { event_id: "m1", status: "present" }, // match → ignoré
    ];
    expect(computeAttendanceRate(attendances, trainingIds)).toBe(0);
  });

  it("compte 'late' comme présent", () => {
    const attendances = [
      { event_id: "t1", status: "present" },
      { event_id: "t2", status: "late" },
      { event_id: "t3", status: "absent" },
      { event_id: "t4", status: "excused" },
    ];
    // present + late = 2 sur 4 → 50
    expect(computeAttendanceRate(attendances, trainingIds)).toBe(50);
  });

  it("arrondit au pourcentage le plus proche", () => {
    const attendances = [
      { event_id: "t1", status: "present" },
      { event_id: "t2", status: "absent" },
      { event_id: "t3", status: "absent" },
    ];
    // 1/3 = 33.33 → 33
    expect(computeAttendanceRate(attendances, trainingIds)).toBe(33);
  });

  it("retourne null quand aucune attendance ne correspond à un entraînement", () => {
    const attendances = [
      { event_id: "m1", status: "present" },
      { event_id: "m2", status: "present" },
    ];
    expect(computeAttendanceRate(attendances, trainingIds)).toBeNull();
  });

  it("retourne null quand la liste d'attendances est vide", () => {
    expect(computeAttendanceRate([], trainingIds)).toBeNull();
  });

  it("retourne null quand il n'y a aucun entraînement", () => {
    const attendances = [{ event_id: "t1", status: "present" }];
    expect(computeAttendanceRate(attendances, [])).toBeNull();
  });
});
