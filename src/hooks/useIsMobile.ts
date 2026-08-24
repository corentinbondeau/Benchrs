"use client";

import { useState, useEffect } from "react";

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
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mq = window.matchMedia("(max-width: 1023px)");

    // Initialisation synchrone avec la valeur courante
    setIsMobile(mq.matches);

    // Listener de changement de viewport
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);

    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
