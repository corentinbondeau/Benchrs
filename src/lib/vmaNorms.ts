// Normes FFF de référence pour la VMA (km/h) et la VMI (km/h) par catégorie d'âge.
// Valeurs de référence usuelles en préparation physique football (fourchettes indicatives).

export type NormStatus = "above" | "average" | "below";

export const NORM_LABELS: Record<NormStatus, string> = {
  above: "Au-dessus",
  average: "Moyen",
  below: "En-dessous",
};

export const NORM_COLORS: Record<NormStatus, string> = {
  above: "bg-green-100 text-green-700 border-green-200",
  average: "bg-blue-100 text-blue-700 border-blue-200",
  below: "bg-red-100 text-red-700 border-red-200",
};

interface NormRange {
  low: number;
  high: number;
}

// Catégorie FFF (U7 → U19, Senior) calculée depuis la date de naissance.
// L'âge de référence est celui au 1er janvier de la saison en cours (août → juillet).
export function fffCategoryFromBirthDate(dob: string | null | undefined, now: Date = new Date()): string | null {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (isNaN(parsed.getTime())) return null;
  const refYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const age = refYear - parsed.getFullYear();
  if (age >= 19) return "Senior";
  return `U${Math.max(7, Math.min(19, age))}`;
}

export const FFF_VMA_NORMS: Record<string, NormRange> = {
  U7: { low: 8.5, high: 10 },
  U8: { low: 9, high: 10.5 },
  U9: { low: 9.5, high: 11 },
  U10: { low: 10, high: 11.5 },
  U11: { low: 10.5, high: 12.5 },
  U12: { low: 11, high: 13 },
  U13: { low: 11.5, high: 13.5 },
  U14: { low: 12, high: 14.5 },
  U15: { low: 12.5, high: 15 },
  U16: { low: 13, high: 16 },
  U17: { low: 14, high: 16.5 },
  U18: { low: 14.5, high: 17 },
  U19: { low: 15, high: 17.5 },
  Senior: { low: 15, high: 19 },
};

export const FFF_VMI_NORMS: Record<string, NormRange> = {
  U7: { low: 11, high: 13 },
  U8: { low: 11.5, high: 13.5 },
  U9: { low: 12, high: 14 },
  U10: { low: 12.5, high: 14.5 },
  U11: { low: 13, high: 15.5 },
  U12: { low: 13.5, high: 16 },
  U13: { low: 14, high: 17 },
  U14: { low: 15, high: 18 },
  U15: { low: 16, high: 19 },
  U16: { low: 17, high: 20 },
  U17: { low: 18, high: 21 },
  U18: { low: 18.5, high: 21.5 },
  U19: { low: 19, high: 22 },
  Senior: { low: 20, high: 24 },
};

export function normRangeFor(category: string | null, norms: Record<string, NormRange>): NormRange | null {
  if (!category) return null;
  return norms[category] ?? null;
}

export function normStatusFor(value: number | null | undefined, range: NormRange | null): NormStatus | null {
  if (value == null || !range) return null;
  if (value < range.low) return "below";
  if (value > range.high) return "above";
  return "average";
}

export function normText(status: NormStatus | null): string {
  if (!status) return "Non évalué";
  return NORM_LABELS[status];
}
