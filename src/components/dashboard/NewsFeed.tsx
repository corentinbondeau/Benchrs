"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Calendar } from "lucide-react";
import type { Event } from "@/types";

export function NewsFeed() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .in("status", ["completed", "upcoming"])
      .order("event_date", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setEvents((data as Event[]) || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
          Actualités récentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune actualité récente
          </p>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-lg border p-3">
                <div className="mt-0.5">
                  {event.type === "match" ? (
                    <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
                  ) : (
                    <Calendar className="h-4 w-4 text-[var(--color-royal)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{event.title}</p>
                    <Badge variant="secondary" className={event.status === "completed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                      {event.status === "completed" ? "Terminé" : "À venir"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(event.event_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                    {event.type === "match" && event.score_us !== null && event.score_them !== null && (
                      <span className="ml-2 font-semibold">
                        {event.score_us} - {event.score_them}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
