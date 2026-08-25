/**
 * Détection heuristique d'un User-Agent "legacy" (navigateur/OS ancien).
 *
 * Fonction pure, sans dépendance Next.js, utilisable côté middleware (proxy.ts).
 * Ne throw jamais : toute entrée non-string ou malformée retourne `false`.
 *
 * Périmètre couvert :
 * - iOS <= 14 (via `CPU iPhone OS <version>_`)
 * - Vieux Safari (desktop ou mobile) via `Version/<1-14>.` combiné à `Safari`
 * - Android <= 8 (via `Android <1-8>.`)
 * - Vieilles WebView Android (héritent du même motif Android)
 *
 * Exclusions volontaires (anti-faux-positif) :
 * - Chrome/Chromium/Edge/Opera desktop modernes (présence de `Chrome`/`Edg`/`OPR`/`CriOS`)
 * - Bots/crawlers (`bot`, `crawler`, `spider`)
 */

const MAX_UA_LENGTH = 2000;

const IOS_LEGACY_RE = /CPU (?:iPhone )?OS (?:1[0-4]|[1-9])_/;
const OLD_SAFARI_VERSION_RE = /Version\/(?:1[0-4]|[1-9])\./;
const SAFARI_RE = /Safari/;
const MODERN_ENGINE_RE = /Chrome|Chromium|CriOS|Edg|OPR/;
const ANDROID_LEGACY_RE = /Android (?:[1-8])\./;
const BOT_RE = /bot|crawler|spider/i;

export function isLegacyUserAgent(ua: string): boolean {
  try {
    if (typeof ua !== "string" || ua.length === 0) {
      return false;
    }

    const safeUa = ua.length > MAX_UA_LENGTH ? ua.slice(0, MAX_UA_LENGTH) : ua;

    if (BOT_RE.test(safeUa)) {
      return false;
    }

    if (IOS_LEGACY_RE.test(safeUa)) {
      return true;
    }

    if (ANDROID_LEGACY_RE.test(safeUa)) {
      return true;
    }

    if (
      OLD_SAFARI_VERSION_RE.test(safeUa) &&
      SAFARI_RE.test(safeUa) &&
      !MODERN_ENGINE_RE.test(safeUa)
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
