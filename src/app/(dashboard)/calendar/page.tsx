"use client";

import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarHeader } from "@/components/calendar/CalendarHeader";
import { MonthView } from "@/components/calendar/MonthView";
import { WeekView } from "@/components/calendar/WeekView";
import type { Event } from "@/types";

export default function CalendarPage() {
  const [view, setView] = useState<"month" | "week">("month");
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

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
  }

  const weekStart = getWeekStart(currentDate);

  const title =
    view === "month"
      ? currentDate.toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        })
      : `Semaine du ${weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;

  function handlePrev() {
    const d = new Date(currentDate);
    if (view === "month") {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - 7);
    }
    setCurrentDate(d);
  }

  function handleNext() {
    const d = new Date(currentDate);
    if (view === "month") {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + 7);
    }
    setCurrentDate(d);
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  if (isPending && events.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Calendrier</h2>
          <p className="text-muted-foreground mt-1">Planning de l&apos;équipe</p>
        </div>
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Calendrier</h2>
        <p className="text-muted-foreground mt-1">Planning de l&apos;équipe</p>
      </div>

      <CalendarHeader
        view={view}
        onViewChange={setView}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        title={title}
      />

      {view === "month" ? (
        <MonthView year={year} month={month} events={events} />
      ) : (
        <WeekView startDate={weekStart} events={events} />
      )}
    </div>
  );
}
