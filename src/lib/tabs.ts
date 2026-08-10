"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface NavTab {
  key: string;
  label: string;
  href: string;
}

export const NAV_TABS: NavTab[] = [
  { key: "stats", label: "Statistiques", href: "/stats" },
  { key: "physical", label: "Prépa physique", href: "/physical" },
  { key: "medical", label: "Infirmerie", href: "/medical" },
  { key: "carpooling", label: "Covoiturage", href: "/carpooling" },
  { key: "tasks", label: "Tâches", href: "/tasks" },
  { key: "polls", label: "Sondages", href: "/polls" },
  { key: "tactics", label: "Tactique", href: "/tactics" },
  { key: "season", label: "Plan de saison", href: "/season" },
  { key: "challenge", label: "Défi de la semaine", href: "/challenge" },
  { key: "gallery", label: "Galerie", href: "/gallery" },
  { key: "trophies", label: "Trophées", href: "/trophies" },
  { key: "championship", label: "Championnat", href: "/championship" },
  { key: "material", label: "Matériel", href: "/material" },
  { key: "adversaires", label: "Adversaires", href: "/adversaires" },
  { key: "compare", label: "Comparer", href: "/stats/compare" },
];

export const NAV_TAB_KEYS = NAV_TABS.map((t) => t.key);

/**
 * Onglets masqués par les coachs pour toute l'équipe.
 * Renvoie un Set des clés d'onglets cachés (vide si aucune ligne => tout visible).
 */
export function useHiddenTabs(teamId?: string): Set<string> {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async (): Promise<Set<string>> => {
    if (!teamId) return new Set();
    const supabase = createClient();
    const { data } = await supabase
      .from("team_tab_visibility")
      .select("tab_key")
      .eq("team_id", teamId)
      .eq("visible", false);
    const rows = (data ?? []) as { tab_key: string }[];
    return new Set(rows.map((r) => r.tab_key));
  }, [teamId]);

  useEffect(() => {
    load().then(setHidden);
  }, [load]);

  return hidden;
}
