"use client";

import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-navy)] text-white px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
        <WifiOff className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-xl font-bold">Hors ligne</h1>
      <p className="mt-2 max-w-xs text-sm text-white/60">
        Pas de connexion internet. Les pages déjà visitées restent accessibles — reconnecte-toi pour rafraîchir.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 rounded-lg bg-[var(--color-primary-blue)] px-4 py-2 text-sm font-semibold text-white"
      >
        Réessayer
      </button>
    </main>
  );
}
