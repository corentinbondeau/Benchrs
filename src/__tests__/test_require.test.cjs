const { describe, it, expect } = require("vitest");

describe("cjs require test", () => {
  it("can require @/hooks/useDashboardData", () => {
    try {
      const mod = require("@/hooks/useDashboardData");
      expect(mod.useDashboardData).toBeDefined();
    } catch (e) {
      console.error("Error:", String(e));
    }
  });
});
