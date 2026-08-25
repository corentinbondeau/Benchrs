import { describe, expect, it } from "vitest";
import { isLegacyUserAgent } from "./legacyUserAgent";

/**
 * Fixtures UA — chaque famille est nommée pour l'anti-régression.
 * Périmètre minimal utile : iPhone 7 / iOS <= 14, vieux Android <= 8.
 * Pas d'exhaustivité UA, pas de base de données externe.
 */

// --- Positifs : doivent être détectés comme "legacy" (true) ---
const LEGACY_UA_FIXTURES: Array<{ label: string; ua: string }> = [
  {
    label: "iOS 12 (iPhone 7 réel, Safari mobile)",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 12_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Mobile/15E148 Safari/604.1",
  },
  {
    label: "iOS 14_3 (borne haute du périmètre legacy)",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
  },
  {
    label: "Vieux Safari desktop/mobile (Version/12.0 ... Safari)",
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/12.0 Safari/604.1.38",
  },
  {
    label: "Vieux Android 6.0",
    ua: "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/45.0.2454.94 Mobile Safari/537.36",
  },
  {
    label: "Très vieux Android 4.4 (KitKat)",
    ua: "Mozilla/5.0 (Linux; U; Android 4.4.2; en-us; SM-G900F Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/30.0.0.0 Mobile Safari/537.36",
  },
  {
    label: "Vieille WebView Android embarquée",
    ua: "Mozilla/5.0 (Linux; Android 5.1; SM-G925F Build/LMY47X; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/43.0.2357.121 Mobile Safari/537.36",
  },
];

// --- Négatifs : ne doivent PAS être détectés (anti-faux-positif) ---
const MODERN_UA_FIXTURES: Array<{ label: string; ua: string }> = [
  {
    label: "iOS 15 récent (limite juste au-dessus du périmètre legacy)",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
  },
  {
    label: "iOS 16 récent",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
  },
  {
    label: "iOS 17 récent",
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  },
  {
    label: "Chrome desktop moderne (Windows)",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  },
  {
    label: "Edge moderne (Chromium-based)",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
  },
  {
    label: "Firefox moderne",
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
  },
  {
    label: "Android 12 récent",
    ua: "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  },
  {
    label: "Googlebot (crawler, ne doit pas être traité comme un mobile legacy)",
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  },
];

describe("isLegacyUserAgent", () => {
  describe("UA legacy connus → true", () => {
    for (const { label, ua } of LEGACY_UA_FIXTURES) {
      it(`détecte : ${label}`, () => {
        expect(isLegacyUserAgent(ua)).toBe(true);
      });
    }
  });

  describe("UA modernes / non pertinents → false (anti-faux-positif)", () => {
    for (const { label, ua } of MODERN_UA_FIXTURES) {
      it(`ne détecte PAS : ${label}`, () => {
        expect(isLegacyUserAgent(ua)).toBe(false);
      });
    }
  });

  describe("robustesse sur entrées limites", () => {
    it("UA vide ('') → false (ne doit pas piéger un UA absent)", () => {
      expect(isLegacyUserAgent("")).toBe(false);
    });

    it("UA undefined casté en argument → false, sans throw", () => {
      // Le proxy peut appeler avec `request.headers.get('user-agent') ?? ''`,
      // mais on garde ce test pour couvrir un appel défensif direct avec undefined.
      expect(() => isLegacyUserAgent(undefined as unknown as string)).not.toThrow();
      expect(isLegacyUserAgent(undefined as unknown as string)).toBe(false);
    });

    it("chaîne malformée / non-UA → ne throw pas, retourne un booléen", () => {
      expect(() => isLegacyUserAgent("###!!!not-a-user-agent???")).not.toThrow();
      expect(typeof isLegacyUserAgent("###!!!not-a-user-agent???")).toBe("boolean");
    });

    it("chaîne très longue (10000 caractères) → ne throw pas, retourne un booléen", () => {
      const veryLongUa = "Mozilla/5.0 " + "A".repeat(10000);
      expect(() => isLegacyUserAgent(veryLongUa)).not.toThrow();
      expect(typeof isLegacyUserAgent(veryLongUa)).toBe("boolean");
    });
  });
});
