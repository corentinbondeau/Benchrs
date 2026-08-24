"use client";

import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { useQueryCache } from "@/lib/queryCache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Calendar } from "lucide-react";
import type { Event } from "@/types";

export function NewsFeed() {
  const router = useRouter();
  const { currentTeam } = useTeam();
  const { data: events, loading } = useQueryCache<Event[]>(
    currentTeam ? `events:feed:${currentTeam.id}` : null,
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, title, event_date, type, status, score_us, score_them")
        .eq("team_id", currentTeam!.id)
        .in("status", ["completed", "upcoming"])
        .order("event_date", { ascending: true })
        .limit(5);
      return (data as Event[]) || [];
    },
    { ttl: 60_000 }
  );

  if (!currentTeam) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!events) return null;

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
              <div
                key={event.id}
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => router.push(event.type === "match" ? `/matches/${event.id}` : `/trainings/${event.id}`)}
              >
                <div className="mt-0.5">
                  {event.type === "match" ? (
                    <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
                  ) : (
                    <Calendar className="h-4 w-4 text-[var(--color-royal)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate flex-1 min-w-0">{event.title}</p>
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
