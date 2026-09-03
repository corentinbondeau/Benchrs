"use client";

import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { X } from "lucide-react";

export function InstallPrompt() {
  const { canInstall, isIOS, isStandalone, promptInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    // Vérifier si déjà refusé dans cette session
    if (typeof window !== "undefined" && sessionStorage.getItem("benchrs:install-dismissed")) {
      setDismissed(true);
      return;
    }
    // Afficher si : prompt natif dispo OU iOS non installé
    setShow(!isStandalone && !dismissed && (canInstall || isIOS));
  }, [canInstall, isIOS, isStandalone, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("benchrs:install-dismissed", "1");
    }
  };

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setShow(false);
    }
  };

  if (!show) return null;

  // iOS Safari : instructions manuelles
  if (isIOS && !canInstall) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-[var(--color-gold)]/30 bg-[var(--color-navy)] p-4 shadow-lg">
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-white"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="mb-3 text-sm font-semibold text-white">
          Ajoute Benchrs sur ton écran d&apos;accueil
        </p>
        <ol className="space-y-2 text-[13px] text-gray-300">
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-blue)] text-[10px] font-bold text-white">1</span>
            <span>Appuie sur le bouton <strong className="text-white">Partager</strong> <span className="inline-block align-middle text-base">⬆</span> en bas de Safari</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-blue)] text-[10px] font-bold text-white">2</span>
            <span>Fais défiler et appuie sur <strong className="text-white">Sur l&apos;écran d&apos;accueil</strong> <span className="inline-block align-middle text-base">➕</span></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-blue)] text-[10px] font-bold text-white">3</span>
            <span>Appuie sur <strong className="text-white">Ajouter</strong> en haut à droite</span>
          </li>
        </ol>
        <p className="mt-3 text-[11px] text-gray-500">
          L&apos;icône Benchrs apparaîtra sur ton écran, comme une vraie appli.
        </p>
      </div>
    );
  }

  // Chrome/Edge Android : prompt natif
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-[var(--color-gold)]/30 bg-[var(--color-navy)] p-4 shadow-lg">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-gray-400 hover:text-white"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="mb-3 text-sm font-medium text-white">
        Installe Benchrs sur ton écran d&apos;accueil pour un accès rapide !
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleInstall}
          className="flex-1 rounded-lg bg-[var(--color-primary-blue)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-blue)]/90"
        >
          Installer
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
