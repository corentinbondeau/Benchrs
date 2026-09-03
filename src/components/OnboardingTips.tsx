"use client";
import { useState } from "react";
import { X, Lightbulb } from "lucide-react";

interface Props {
  tipKey: string; // ex: "dashboard-welcome", "calendar-create"
  title: string;
  description: string;
}

export function OnboardingTip({ tipKey, title, description }: Props) {
  const [visible, setVisible] = useState<boolean>(
    () => typeof window !== "undefined" && !localStorage.getItem(`benchrs:tip:${tipKey}`)
  );

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(`benchrs:tip:${tipKey}`, "1");
    setVisible(false);
  };

  return (
    <div className="rounded-xl border border-[var(--color-gold)]/30 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
      <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{title}</p>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{description}</p>
      </div>
      <button onClick={dismiss} className="text-amber-400 hover:text-amber-600 shrink-0" aria-label="Fermer">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
