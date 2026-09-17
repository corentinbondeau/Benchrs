"use client";

import { useSyncExternalStore } from "react";

/**
 * Hook useIsMobile
 *
 * Retourne `true` quand le viewport est < 1024px (mobile/tablet),
 * `false` sinon (desktop).
 *
 * - Valeur par défaut : `false` (desktop-first, SSR-safe)
 * - Utilise `window.matchMedia` avec listener de changement pour réactivité
 * - Guard `typeof window !== 'undefined'` pour la compatibilité SSR/jsdom
 */

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(max-width: 1023px)");
  const handler = (e: MediaQueryListEvent) => callback();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(max-width: 1023px)").matches;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}