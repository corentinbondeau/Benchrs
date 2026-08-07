export const DRILL_TYPES = ["échauffement", "technique", "tactique", "physique", "jeu"] as const;

export type DrillType = (typeof DRILL_TYPES)[number];
