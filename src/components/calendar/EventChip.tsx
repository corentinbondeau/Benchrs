"use client";

import type { Event } from "@/types";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EventChipProps {
  event: Event;
  compact?: boolean;
}

export function EventChip({ event, compact }: EventChipProps) {
  const isMatch = event.type === "match";
  const time = new Date(event.event_date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const chip = (
    <div
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs font-medium truncate cursor-default",
        isMatch
          ? "bg-[var(--gold)]/15 text-[var(--gold)] border border-[var(--gold)]/30"
          : "bg-[var(--royal)]/15 text-[var(--royal)] border border-[var(--royal)]/30"
      )}
    >
      {compact ? time : `${time} ${event.title}`}
    </div>
  );

  return (
    <Popover>
      <PopoverTrigger render={<div className="cursor-pointer" />}>
        {chip}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                isMatch ? "bg-[var(--gold)]" : "bg-[var(--royal)]"
              )}
            />
            <span className="text-xs font-medium uppercase text-muted-foreground">
              {isMatch ? "Match" : "Entraînement"}
            </span>
          </div>
          <p className="font-semibold text-sm">{event.title}</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              📅 {new Date(event.event_date).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <p>⏰ {time}</p>
            {event.location && <p>📍 {event.location}</p>}
            {event.opponent && <p>🆚 {event.opponent}</p>}
            {event.status === "completed" && event.match_result && (
              <p className="font-medium text-foreground">
                Résultat : {event.score_us} - {event.score_them}
                {event.match_result === "win" && " ✅"}
                {event.match_result === "loss" && " ❌"}
                {event.match_result === "draw" && " 🤝"}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
