"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface CalendarHeaderProps {
  view: "month" | "week";
  onViewChange: (view: "month" | "week") => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  title: string;
}

export function CalendarHeader({
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  title,
}: CalendarHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-bold">{title}</h3>
        <Button variant="outline" size="sm" onClick={onToday}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" />
          Aujourd&apos;hui
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border overflow-hidden">
          <Button
            variant={view === "month" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none border-0"
            onClick={() => onViewChange("month")}
          >
            Mois
          </Button>
          <Button
            variant={view === "week" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none border-0"
            onClick={() => onViewChange("week")}
          >
            Semaine
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
