"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Event } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Clock } from "lucide-react";

export function NextEventCard() {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .in("status", ["upcoming", "ongoing"])
      .gte("event_date", new Date().toISOString())
      .order("event_date", { ascending: true })
      .limit(1)
      .single()
      .then(({ data }) => {
        setEvent(data as Event | null);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

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
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  let countdown = "";
  if (diffDays > 0) countdown = `${diffDays}j ${diffHours}h`;
  else if (diffHours > 0) countdown = `${diffHours}h`;
  else countdown = "Bientôt";

  return (
    <Card className="bg-gradient-to-r from-[var(--color-navy)] to-[var(--color-royal)] text-white">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-white/60 text-sm font-medium uppercase tracking-wide">
              {event.type === "match" ? "Prochain match" : "Prochain entraînement"}
            </p>
            <h3 className="text-xl font-bold">{event.title}</h3>
            {event.opponent && (
              <p className="text-white/80">vs {event.opponent}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-white/70">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {eventDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {eventDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {event.location}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center rounded-lg bg-[var(--color-gold)] px-3 py-1.5 text-sm font-bold text-[var(--color-navy)]">
              {countdown}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
