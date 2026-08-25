"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="antialiased">
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-navy)] p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
            <h1 className="text-2xl font-bold mb-2">Une erreur est survenue</h1>
            <p className="text-sm text-muted-foreground mb-4">
              L&apos;application a rencontré un problème inattendu.
            </p>
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center mb-4"
            >
              {error.message || "Erreur inattendue."}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => reset()}
                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Réessayer
              </button>
              <a
                href="/"
                className="inline-flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium"
              >
                Retour à l&apos;accueil
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
