"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ScheduleEventCard } from "./ScheduleEventCard";
import type { Event } from "@/types";

interface WeekScheduleViewProps {
  startDate: Date;
  events: Event[];
}

const DAY_NAMES = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

function getWeekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function WeekScheduleView({ startDate, events }: WeekScheduleViewProps) {
  const days = getWeekDays(startDate);
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((event) => {
      const d = new Date(event.event_date);
      const key = d.toISOString().split("T")[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    });
    return map;
  }, [events]);

  return (
    <div className="space-y-3">
      {days.map((day, i) => {
        const key = day.toISOString().split("T")[0];
        const dayEvents = eventsByDay.get(key) || [];
        const isToday =
          day.getFullYear() === today.getFullYear() &&
          day.getMonth() === today.getMonth() &&
          day.getDate() === today.getDate();

        return (
          <div key={i} className="rounded-lg border overflow-hidden">
            <div
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 border-b",
                isToday
                  ? "bg-[var(--gold)]/10"
                  : "bg-muted/30"
              )}
            >
              <div>
                <p
                  className={cn(
                    "font-semibold text-sm",
                    isToday && "text-[var(--gold)]"
                  )}
                >
                  {DAY_NAMES[i]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {day.toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              {isToday && (
                <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-bold text-[var(--gold-foreground)]">
                  AUJOURD&apos;HUI
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {dayEvents.length} événement{dayEvents.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="p-3 space-y-2">
              {dayEvents.length > 0 ? (
                dayEvents.map((event) => (
                  <ScheduleEventCard key={event.id} event={event} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Aucun événement prévu
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
