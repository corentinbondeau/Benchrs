"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CountdownTimer } from "./CountdownTimer";
import { Calendar } from "lucide-react";
import type { Event } from "@/types";

export function NextEventCard() {
  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function fetchNextEvent() {
      const { data } = await supabase
        .from("events")
        .select("*")
        .in("status", ["upcoming", "ongoing"])
        .gte("event_date", new Date().toISOString())
        .order("event_date", { ascending: true })
        .limit(1)
        .single();

      setEvent(data as Event | null);
    }

    fetchNextEvent();
  }, []);

  if (!event) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        <div className="text-center">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucun événement à venir</p>
        </div>
      </div>
    );
  }

  const eventDate = new Date(event.event_date);
  const timeStr = eventDate.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <CountdownTimer
      targetDate={event.event_date}
      title={event.title}
      location={event.location}
      time={timeStr}
    />
  );
}
