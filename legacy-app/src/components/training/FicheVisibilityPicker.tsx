"use client";

import { Lock, Users } from "lucide-react";

export type FicheVisibility = "coach" | "team";

export function VisibilityPicker({
  value,
  onChange,
}: {
  value: FicheVisibility;
  onChange: (v: FicheVisibility) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-0.5">
      <button
        type="button"
        onClick={() => onChange("coach")}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          value === "coach"
            ? "bg-[var(--color-navy)] text-white"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        <Lock className="h-3 w-3" />
        Coachs
      </button>
      <button
        type="button"
        onClick={() => onChange("team")}
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
          value === "team"
            ? "bg-[var(--color-navy)] text-white"
            : "text-muted-foreground hover:bg-muted"
        }`}
      >
        <Users className="h-3 w-3" />
        Équipe
      </button>
    </div>
  );
}
