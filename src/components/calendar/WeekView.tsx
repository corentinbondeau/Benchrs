"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { EventChip } from "./EventChip";
import type { Event } from "@/types";

interface WeekViewProps {
  startDate: Date;
  events: Event[];
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6);

function getWeekDays(start: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function WeekView({ startDate, events }: WeekViewProps) {
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
    <div className="rounded-lg border overflow-x-auto">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
          <div className="border-r bg-muted/30" />
          {days.map((day, i) => {
            const isToday =
              day.getFullYear() === today.getFullYear() &&
              day.getMonth() === today.getMonth() &&
              day.getDate() === today.getDate();
            return (
              <div
                key={i}
                className={cn(
                  "px-2 py-2.5 text-center border-r last:border-r-0",
                  isToday && "bg-[var(--gold)]/5"
                )}
              >
                <p className="text-xs text-muted-foreground uppercase">
                  {day.toLocaleDateString("fr-FR", { weekday: "short" })}
                </p>
                <p
                  className={cn(
                    "text-lg font-bold",
                    isToday && "text-[var(--gold)]"
                  )}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-r border-b px-1 py-2 text-[10px] text-muted-foreground text-right">
                {`${hour.toString().padStart(2, "0")}:00`}
              </div>
              {days.map((day, di) => {
                const key = day.toISOString().split("T")[0];
                const dayEvents = (eventsByDay.get(key) || []).filter((e) => {
                  const h = new Date(e.event_date).getHours();
                  return h === hour;
                });

                return (
                  <div
                    key={di}
                    className="border-r border-b last:border-r-0 p-0.5 min-h-[2.5rem]"
                  >
                    {dayEvents.map((event) => (
                      <EventChip key={event.id} event={event} />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
