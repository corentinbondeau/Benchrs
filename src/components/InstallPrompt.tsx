"use client";

import { useEffect, useState } from "react";
import { useInstallPrompt } from "@/lib/useInstallPrompt";

export function InstallPrompt() {
  const { canInstall, isStandalone, promptInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  useEffect(() => {
    setShow(canInstall && !isStandalone && !dismissed);
  }, [canInstall, isStandalone, dismissed]);

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) {
      setShow(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border border-[var(--color-gold)]/30 bg-[var(--color-navy)] p-4 shadow-lg">
      <p className="mb-3 text-sm font-medium text-white">
        Installe Benchrs sur ton écran d'accueil pour un accès rapide !
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleInstall}
          className="flex-1 rounded-lg bg-[var(--color-primary-blue)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-blue)]/90"
        >
          Installer
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
