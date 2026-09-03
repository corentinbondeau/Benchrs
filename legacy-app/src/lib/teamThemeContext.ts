"use client";

import { createContext, useContext } from "react";

export interface TeamThemeColors {
  colorPrimary: string;
  colorSecondary: string;
}

const defaults: TeamThemeColors = {
  colorPrimary: "var(--color-primary-blue)",
  colorSecondary: "var(--color-gold)",
};

export const TeamThemeContext = createContext<TeamThemeColors>(defaults);

export function useTeamThemeContext(): TeamThemeColors {
  return useContext(TeamThemeContext);
}
