import { describe, it, expect, beforeEach } from "vitest";
import {
  readPendingInvite,
  savePendingInvite,
  clearPendingInvite,
  resolveInviteCode,
  extractInviteCode,
} from "./invite";

const KEY = "pendingInviteCode";

describe("invite code persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("readPendingInvite", () => {
    it("returns empty string when nothing is stored", () => {
      expect(readPendingInvite()).toBe("");
    });

    it("returns the stored code", () => {
      const t0 = Date.now();
      savePendingInvite("abc123", t0);
      expect(readPendingInvite(t0)).toBe("abc123");
    });

    it("stores the code with a timestamp", () => {
      savePendingInvite("abc123", 1_000_000);
      const stored = JSON.parse(window.localStorage.getItem(KEY) as string);
      expect(stored).toEqual({ code: "abc123", ts: 1_000_000 });
    });

    it("returns the code when read within the 24h window", () => {
      const t0 = 1_000_000;
      savePendingInvite("abc123", t0);
      expect(readPendingInvite(t0 + 60_000)).toBe("abc123");
    });

    it("returns empty and clears the entry when expired", () => {
      const t0 = 1_000_000;
      savePendingInvite("abc123", t0);
      expect(readPendingInvite(t0 + 24 * 60 * 60 * 1000 + 1)).toBe("");
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });

    it("returns empty for a corrupted entry without throwing", () => {
      window.localStorage.setItem(KEY, "not-json");
      expect(readPendingInvite()).toBe("");
    });

    it("returns empty for an entry missing its timestamp", () => {
      window.localStorage.setItem(KEY, JSON.stringify({ code: "abc123" }));
      expect(readPendingInvite()).toBe("");
    });
  });

  describe("savePendingInvite", () => {
    it("ignores an empty code", () => {
      savePendingInvite("");
      expect(window.localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe("clearPendingInvite", () => {
    it("removes the stored code", () => {
      savePendingInvite("abc123", 1_000_000);
      clearPendingInvite();
      expect(readPendingInvite(1_000_000)).toBe("");
    });
  });

  describe("resolveInviteCode", () => {
    it("prefers the code from the link", () => {
      savePendingInvite("fromStorage", 1_000_000);
      expect(resolveInviteCode("fromUrl")).toBe("fromUrl");
    });

    it("falls back to the stored code when the link has none", () => {
      savePendingInvite("fromStorage", Date.now());
      expect(resolveInviteCode("")).toBe("fromStorage");
      expect(resolveInviteCode(null)).toBe("fromStorage");
      expect(resolveInviteCode(undefined)).toBe("fromStorage");
    });

    it("returns empty when there is neither link nor storage", () => {
      expect(resolveInviteCode("")).toBe("");
      expect(resolveInviteCode(null)).toBe("");
    });
  });

  describe("extractInviteCode", () => {
    it("extracts the code from a next path", () => {
      expect(extractInviteCode("/join?code=abc123")).toBe("abc123");
    });

    it("extracts the code when other params are present", () => {
      expect(extractInviteCode("/login?next=%2Fjoin%3Fcode%3Dabc123&x=1")).toBe(
        "abc123"
      );
      expect(extractInviteCode("/join?foo=1&code=abc123")).toBe("abc123");
    });

    it("stops at the fragment separator", () => {
      expect(extractInviteCode("/join?code=abc123#section")).toBe("abc123");
    });

    it("decodes percent-encoded codes", () => {
      expect(extractInviteCode("/join?code=a%2Bb%2Fc")).toBe("a+b/c");
    });

    it("falls back to the raw value when decoding fails", () => {
      expect(extractInviteCode("/join?code=%E0%A4%A")).toBe("%E0%A4%A");
    });

    it("returns empty when there is no code param", () => {
      expect(extractInviteCode(null)).toBe("");
      expect(extractInviteCode(undefined)).toBe("");
      expect(extractInviteCode("")).toBe("");
      expect(extractInviteCode("/dashboard")).toBe("");
      expect(extractInviteCode("/join?other=abc")).toBe("");
    });

    it("does not match a code= substring that is not a query param", () => {
      expect(extractInviteCode("/join/mycode=abc")).toBe("");
    });
  });
});
