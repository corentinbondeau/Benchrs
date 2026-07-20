"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Event } from "@/types";

interface ScheduleEventCardProps {
  event: Event;
}

export function ScheduleEventCard({ event }: ScheduleEventCardProps) {
  const isMatch = event.type === "match";
  const time = new Date(event.event_date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "rounded-lg border-l-4 p-3 bg-card transition-shadow hover:shadow-sm",
        isMatch ? "border-l-[var(--gold)]" : "border-l-[var(--royal)]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{event.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">⏰ {time}</p>
          {event.location && (
            <p className="text-xs text-muted-foreground">📍 {event.location}</p>
          )}
          {event.opponent && (
            <p className="text-xs text-muted-foreground">🆚 {event.opponent}</p>
          )}
        </div>
        <Badge
          variant="secondary"
          className={cn(
            "shrink-0 text-[10px]",
            isMatch
              ? "bg-[var(--gold)]/10 text-[var(--gold)]"
              : "bg-[var(--royal)]/10 text-[var(--royal)]"
          )}
        >
          {isMatch ? "Match" : "Entraînement"}
        </Badge>
      </div>
    </div>
  );
}
