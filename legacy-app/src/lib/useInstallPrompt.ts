"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * useInstallPrompt — hook partagé pour la logique d'installation PWA.
 *
 * Extrait de InstallPrompt.tsx pour être réutilisable ailleurs (ex: l'étape
 * `install_app` de l'onboarding universel), sans dupliquer la détection
 * iOS/standalone ni la gestion de l'évènement `beforeinstallprompt`.
 *
 * Choix hook plutôt que Context Provider : l'état (deferredPrompt captée une
 * fois via un listener window, isIOS/isStandalone calculés une fois au mount)
 * n'a pas besoin d'être partagé entre plusieurs consommateurs simultanés au
 * sein d'un même rendu — chaque consommateur peut monter son propre listener
 * sans coût ni risque de désynchronisation. Un Provider ajouterait de la
 * complexité (wrapping supplémentaire dans le layout) pour un bénéfice nul
 * ici, InstallPrompt et l'étape d'onboarding n'étant jamais montés en même
 * temps dans la pratique.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface UseInstallPromptResult {
  canInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<boolean>;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPhone / iPod classiques, et iPad avant iPadOS 13.
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ se présente comme un Mac desktop mais expose le multi-touch.
  if (
    ua.includes("Macintosh") &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari expose navigator.standalone (non standard, non typé par lib.dom).
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsIOS(detectIOS());
    setIsStandalone(detectStandalone());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return result.outcome === "accepted";
  }, [deferredPrompt]);

  return {
    canInstall: deferredPrompt !== null,
    isIOS,
    isStandalone,
    promptInstall,
  };
}
