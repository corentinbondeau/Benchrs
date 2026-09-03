"use client";

import { useTeamThemeContext } from "@/lib/teamThemeContext";

/**
 * Applique les couleurs de l'équipe comme CSS variables sur le conteneur racine.
 * Extrait dans un composant séparé pour permettre le mock indépendant dans les tests.
 * Consomme TeamThemeContext (module séparé de @/lib/team) pour rester résilient
 * quand @/lib/team est partiellement mocké dans les tests unitaires de layout.
 */
export function TeamThemeApplier({ children }: { children: React.ReactNode }) {
  const { colorPrimary, colorSecondary } = useTeamThemeContext();

  const teamStyle = {
    "--team-primary": colorPrimary,
    "--team-secondary": colorSecondary,
  } as React.CSSProperties;

  return (
    <div className="contents" style={teamStyle}>
      {children}
    </div>
  );
}
