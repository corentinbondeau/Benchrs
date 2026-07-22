"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Event } from "@/types";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Users } from "lucide-react";

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
  const [attendance, setAttendance] = useState<{ present: number; total: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function fetchAttendance() {
      const { count: total } = await supabase
        .from("attendances")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id);

      const { count: present } = await supabase
        .from("attendances")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .in("status", ["present", "late"]);

      setAttendance({
        present: present || 0,
        total: total || 0,
      });
    }
    fetchAttendance();
  }, [event.id]);

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
      {attendance && attendance.total > 0 && (
        <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] opacity-75">
          <Users className="h-2.5 w-2.5" />
          {attendance.present}/{attendance.total}
        </span>
      )}
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
            {attendance && attendance.total > 0 && (
              <p className="flex items-center gap-1 font-medium text-foreground">
                <Users className="h-3 w-3" />
                Présences : {attendance.present}/{attendance.total}
              </p>
            )}
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
