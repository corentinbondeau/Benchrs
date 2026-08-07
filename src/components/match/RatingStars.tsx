"use client";

import { Star, StarHalf } from "lucide-react";

/** Notes autorisées : de 1 à 10 par pas de 0.5 */
export const RATING_OPTIONS = Array.from({ length: 19 }, (_, i) => (i + 2) / 2);

/** Affichage d'une note en étoiles (supporte les demi-étoiles). */
export function RatingStars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  const v = Math.round(value * 2) / 2;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => {
        const full = v >= i + 1;
        const half = !full && v >= i + 0.5;
        if (half) {
          return (
            <StarHalf
              key={i}
              className={`${size} text-[var(--color-gold)] fill-[var(--color-gold)]`}
            />
          );
        }
        return (
          <Star
            key={i}
            className={`${size} ${
              full
                ? "text-[var(--color-gold)] fill-[var(--color-gold)]"
                : "text-muted-foreground/30"
            }`}
          />
        );
      })}
    </div>
  );
}

/** Sélecteur de note avec pas de 0.5 (1 → 10). */
export function RatingSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="flex h-9 w-auto rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
      aria-label="Note sur 10"
    >
      <option value={0}>—</option>
      {RATING_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
