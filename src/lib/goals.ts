import type { GoalCategory } from "@/types";

export interface GoalCategoryInfo {
  value: GoalCategory;
  label: string;
  unit: string;
  hint: string;
}

export const GOAL_CATEGORIES: GoalCategoryInfo[] = [
  { value: "goals", label: "Buts", unit: "buts", hint: "Nombre de buts marqués dans la saison" },
  { value: "assists", label: "Passes décisives", unit: "passes", hint: "Nombre de passes décisives dans la saison" },
  { value: "matches", label: "Matchs joués", unit: "matchs", hint: "Nombre de matchs joués dans la saison" },
  { value: "minutes", label: "Minutes jouées", unit: "min", hint: "Minutes de jeu cumulées dans la saison" },
  { value: "assiduite", label: "Assiduité", unit: "%", hint: "Taux de présence aux entraînements et matchs" },
  { value: "other", label: "Objectif libre", unit: "", hint: "Un objectif personnalisé, suivi manuellement" },
];

export function goalCategoryInfo(category: GoalCategory): GoalCategoryInfo {
  return GOAL_CATEGORIES.find((c) => c.value === category) ?? GOAL_CATEGORIES[GOAL_CATEGORIES.length - 1];
}

export function currentSeasonLabel(now: Date = new Date()): string {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

export function previousSeasonLabel(season: string): string {
  const m = season.match(/^(\d{4})-/);
  if (!m) return currentSeasonLabel();
  const y = parseInt(m[1], 10) - 1;
  return `${y}-${y + 1}`;
}

export function seasonDateRange(season: string): { start: Date; end: Date } | null {
  const m = season.match(/^(\d{4})-(\d{4})$/);
  if (!m) return null;
  const y1 = parseInt(m[1], 10);
  const y2 = parseInt(m[2], 10);
  if (y2 !== y1 + 1) return null;
  return {
    start: new Date(y1, 7, 1),
    end: new Date(y2, 6, 31, 23, 59, 59, 999),
  };
}

const QUARTER_MONTHS = [
  [7, 8, 9], // T1 : août, septembre, octobre
  [10, 11, 0], // T2 : novembre, décembre, janvier
  [1, 2, 3], // T3 : février, mars, avril
  [4, 5, 6], // T4 : mai, juin, juillet
];

export function quarterKeyForDate(date: Date): string {
  const season = currentSeasonLabel(date);
  const q = QUARTER_MONTHS.findIndex((months) => months.includes(date.getMonth())) + 1;
  return `${season}-T${q}`;
}

export function currentQuarterKey(now: Date = new Date()): string {
  return quarterKeyForDate(now);
}

export function quarterDateRange(key: string): { start: Date; end: Date } | null {
  const m = key.match(/^(\d{4})-(\d{4})-T([1-4])$/);
  if (!m) return null;
  const y1 = parseInt(m[1], 10);
  const y2 = parseInt(m[2], 10);
  if (y2 !== y1 + 1) return null;
  const q = parseInt(m[3], 10);
  const months = QUARTER_MONTHS[q - 1];
  const start = new Date(y1, months[0], 1);
  const endMonth = months[2] === 0 ? 12 : months[2];
  const endYear = months[2] === 0 ? y2 : y2;
  const end = new Date(endYear, endMonth, 1);
  end.setDate(0); // dernier jour du mois précédent
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function quarterLabel(key: string): string {
  const range = quarterDateRange(key);
  if (!range) return key;
  const start = range.start.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  const end = range.end.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  return `${start} – ${end}`;
}
