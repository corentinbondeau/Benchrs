/**
 * Navigation legacy filtrée par rôle — miroir simplifié de la nav moderne
 * (Sidebar/BottomNav) pour les pages HTML vanilla `/legacy`.
 *
 * Le rôle vient de `team_members.role` (owner|coach|player|parent). Les onglets
 * `coachOnly` ne sont visibles que pour coach/owner. `hiddenKeys` reproduit le
 * masquage d'onglets décidé par le coach pour toute l'équipe (team_tab_visibility).
 */

export type LegacyRole = "owner" | "coach" | "player" | "parent" | null;

export interface LegacyNavItem {
  key: string;
  href: string;
  label: string;
  sublabel: string;
  icon: string;
  tint: string;
  iconColor: string;
  coachOnly?: boolean;
}

// Palette de pastilles alignée sur la charte (dashboard moderne).
const ITEMS: LegacyNavItem[] = [
  { key: "calendar", href: "/legacy/calendar", label: "Agenda", sublabel: "Matchs & entraînements", icon: "📅", tint: "#EFF6FF", iconColor: "#2563EB" },
  { key: "roster", href: "/legacy/roster", label: "Équipe", sublabel: "L'effectif", icon: "👥", tint: "#ECFDF5", iconColor: "#16A34A" },
  { key: "stats", href: "/legacy/stats", label: "Performance", sublabel: "Statistiques & assiduité", icon: "📊", tint: "#FAF5FF", iconColor: "#9333EA" },
  { key: "attendance", href: "/legacy/attendance", label: "Présences", sublabel: "Répondre aux convocations", icon: "✓", tint: "#FFFBEB", iconColor: "#B45309" },
  { key: "medical", href: "/legacy/medical", label: "Infirmerie", sublabel: "Blessures en cours", icon: "＋", tint: "#FEF2F2", iconColor: "#DC2626" },
];

export interface LegacyNavOptions {
  hiddenKeys?: string[];
}

export function legacyNavForRole(role: LegacyRole, opts: LegacyNavOptions = {}): LegacyNavItem[] {
  if (!role) return [];

  const isCoach = role === "coach" || role === "owner";
  const hidden = new Set(opts.hiddenKeys ?? []);

  return ITEMS.filter((item) => {
    if (item.coachOnly && !isCoach) return false;
    if (hidden.has(item.key)) return false;
    return true;
  });
}
