"use client";

import { useEffect, useState } from "react";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShow(false);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setShow(false);
    }
    setDeferredPrompt(null);
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
          className="flex-1 rounded-lg bg-[var(--color-gold)] px-4 py-2 text-sm font-semibold text-[var(--color-navy)] transition-colors hover:bg-[var(--color-gold)]/90"
        >
          Installer
        </button>
        <button
          onClick={() => setShow(false)}
          className="rounded-lg px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          Plus tard
        </button>
      </div>
    </div>
  );
}
