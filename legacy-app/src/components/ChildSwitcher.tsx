"use client";

import { Users } from "lucide-react";
import type { ChildInfo } from "@/lib/useSelectedChild";

interface Props {
  kids: ChildInfo[];
  selectedChildId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export function ChildSwitcher({ kids, selectedChildId, onSelect, className }: Props) {
  if (kids.length <= 1) return null;
  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        Pour quel enfant ?
      </p>
      <div className="flex flex-wrap gap-1 rounded-lg border p-0.5 w-fit">
        {kids.map((child) => {
          const active = child.id === selectedChildId;
          return (
            <button
              key={child.id}
              type="button"
              onClick={() => onSelect(child.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--color-navy)] text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {child.first_name} {child.last_name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
