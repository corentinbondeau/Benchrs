"use client";

import { useCountdown } from "@/hooks/useCountdown";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock } from "lucide-react";

interface CountdownTimerProps {
  targetDate: string;
  title: string;
  location?: string | null;
  time?: string;
}

export function CountdownTimer({
  targetDate,
  title,
  location,
  time,
}: CountdownTimerProps) {
  const { days, hours, minutes, seconds } = useCountdown(targetDate);
  const isUrgent = days === 0 && hours < 6;

  return (
    <Card className="overflow-hidden border-[var(--royal)]/20">
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Badge className="bg-[var(--gold)] text-[var(--gold-foreground)] mb-2">
              Prochain événement
            </Badge>
            <h3 className="text-white font-semibold text-lg">{title}</h3>
            <div className="flex items-center gap-4 mt-2 text-blue-200 text-sm">
              {location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {location}
                </span>
              )}
              {time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {time}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <CardContent className="p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { value: days, label: "Jours" },
            { value: hours, label: "Heures" },
            { value: minutes, label: "Min" },
            { value: seconds, label: "Sec" },
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center">
              <span
                className={`text-2xl font-bold tabular-nums ${
                  isUrgent ? "text-amber-500" : "text-foreground"
                }`}
              >
                {String(value).padStart(2, "0")}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
