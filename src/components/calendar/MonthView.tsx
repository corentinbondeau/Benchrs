"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { EventChip } from "./EventChip";
import type { Event } from "@/types";

interface MonthViewProps {
  year: number;
  month: number;
  events: Event[];
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

export function MonthView({ year, month, events }: MonthViewProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();

  const eventsByDay = useMemo(() => {
    const map = new Map<number, Event[]>();
    events.forEach((event) => {
      const d = new Date(event.event_date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(event);
      }
    });
    return map;
  }, [events, year, month]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((wd) => (
          <div
            key={wd}
            className="px-2 py-2.5 text-center text-xs font-semibold uppercase text-muted-foreground border-b bg-muted/30"
          >
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const isToday =
            day !== null &&
            today.getFullYear() === year &&
            today.getMonth() === month &&
            today.getDate() === day;
          const dayEvents = day ? eventsByDay.get(day) || [] : [];

          return (
            <div
              key={i}
              className={cn(
                "min-h-[5rem] border-b border-r p-1.5 last:border-r-0",
                day === null && "bg-muted/20",
                isToday && "bg-[var(--gold)]/5"
              )}
            >
              {day !== null && (
                <>
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday && "bg-[var(--gold)] text-[var(--gold-foreground)] font-bold"
                    )}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <EventChip key={event.id} event={event} compact />
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-1">
                        +{dayEvents.length - 3} de plus
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
