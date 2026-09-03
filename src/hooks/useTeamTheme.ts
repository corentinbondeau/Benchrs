"use client";

import { useTeam } from "@/lib/team";

/**
 * Expose les couleurs de l'équipe courante pour l'application du thème CSS.
 * Séparé dans son propre hook pour permettre le mock indépendant de @/lib/team
 * dans les tests unitaires de layout.
 */
export function useTeamTheme() {
  const { currentTeam } = useTeam();
  return {
    colorPrimary: currentTeam?.color_primary ?? "var(--color-primary-blue)",
    colorSecondary: currentTeam?.color_secondary ?? "var(--color-gold)",
  };
}
