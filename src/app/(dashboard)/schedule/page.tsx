"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { WeekScheduleView } from "@/components/schedule/WeekScheduleView";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import type { Event } from "@/types";

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) {
          startTransition(() => {
            setEvents((data as Event[]) || []);
          });
        }
      });

    return () => { cancelled = true; };
  }, []);

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getWeekEnd(start: Date) {
    const d = new Date(start);
    d.setDate(d.getDate() + 6);
    return d;
  }

  const weekStart = getWeekStart(currentDate);
  const weekEnd = getWeekEnd(weekStart);

  const title = `Semaine du ${weekStart.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  })} — ${weekEnd.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  })}`;

  function handlePrev() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }

  function handleNext() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  if (isPending && events.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Planning</h2>
          <p className="text-muted-foreground mt-1">Emploi du temps de la semaine</p>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Planning</h2>
        <p className="text-muted-foreground mt-1">Emploi du temps de la semaine</p>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            <CalendarDays className="h-3.5 w-3.5 mr-1" />
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <WeekScheduleView startDate={weekStart} events={events} />
    </div>
  );
}
