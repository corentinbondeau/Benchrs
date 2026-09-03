"use client";

import { useTeam } from "@/lib/team";

/**
 * Applique les couleurs de l'équipe comme CSS variables sur le conteneur racine.
 * Extrait dans un composant séparé pour permettre le mock indépendant dans les tests.
 */
export function TeamThemeApplier({ children }: { children: React.ReactNode }) {
  const { currentTeam } = useTeam();

  const teamStyle = {
    "--team-primary": currentTeam?.color_primary || "var(--color-primary-blue)",
    "--team-secondary": currentTeam?.color_secondary || "var(--color-gold)",
  } as React.CSSProperties;

  return (
    <div className="contents" style={teamStyle}>
      {children}
    </div>
  );
}
