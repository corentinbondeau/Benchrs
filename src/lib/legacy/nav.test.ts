import { describe, it, expect } from "vitest";
import { legacyNavForRole } from "./nav";

describe("legacyNavForRole", () => {
  it("player : vue restreinte (accueil, calendrier, effectif, performance, présences, infirmerie) sans onglets coachOnly", () => {
    const items = legacyNavForRole("player");
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/legacy/calendar");
    expect(hrefs).toContain("/legacy/roster");
    expect(hrefs).toContain("/legacy/stats");
    expect(hrefs).toContain("/legacy/attendance");
    expect(hrefs).toContain("/legacy/medical");
    // pas d'onglet réservé coach pour un joueur
    expect(hrefs).not.toContain("/legacy/admin");
  });

  it("parent : même périmètre de base qu'un joueur (pas de coachOnly)", () => {
    const player = legacyNavForRole("player").map((i) => i.href).sort();
    const parent = legacyNavForRole("parent").map((i) => i.href).sort();
    expect(parent).toEqual(player);
  });

  it("coach : superset du périmètre joueur (au moins autant d'onglets)", () => {
    const player = legacyNavForRole("player");
    const coach = legacyNavForRole("coach");
    expect(coach.length).toBeGreaterThanOrEqual(player.length);
    const coachHrefs = new Set(coach.map((i) => i.href));
    for (const i of player) expect(coachHrefs.has(i.href)).toBe(true);
  });

  it("owner : mêmes droits qu'un coach", () => {
    const coach = legacyNavForRole("coach").map((i) => i.href).sort();
    const owner = legacyNavForRole("owner").map((i) => i.href).sort();
    expect(owner).toEqual(coach);
  });

  it("hiddenKeys masque les onglets correspondants pour toute l'équipe", () => {
    const withStats = legacyNavForRole("player").map((i) => i.href);
    expect(withStats).toContain("/legacy/stats");
    const hidden = legacyNavForRole("player", { hiddenKeys: ["stats"] }).map((i) => i.href);
    expect(hidden).not.toContain("/legacy/stats");
  });

  it("chaque item a href, label, sublabel, icon, tint et iconColor non vides", () => {
    for (const i of legacyNavForRole("coach")) {
      expect(i.href).toBeTruthy();
      expect(i.label).toBeTruthy();
      expect(i.sublabel).toBeTruthy();
      expect(i.icon).toBeTruthy();
      expect(i.tint).toMatch(/^#/);
      expect(i.iconColor).toMatch(/^#/);
    }
  });

  it("role null (non connecté) : aucun onglet interne (le menu visiteur est géré ailleurs)", () => {
    expect(legacyNavForRole(null)).toEqual([]);
  });
});
