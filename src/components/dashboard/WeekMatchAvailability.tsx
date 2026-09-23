"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { useQueryCache, clearQueryCache } from "@/lib/queryCache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarCheck, MapPin, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { isEventLocked, CONVOCATION_LOCKED_MESSAGE } from "@/lib/event-lock";
import type { Event } from "@/types";

type AvailabilityValue = "dispo" | "pas_dispo" | "incertain";

const LABELS: Record<AvailabilityValue, string> = {
  dispo: "Dispo",
  pas_dispo: "Pas dispo",
  incertain: "Incertain",
};

const STYLES: Record<AvailabilityValue, string> = {
  dispo: "border-emerald-300 bg-emerald-50 text-emerald-700",
  pas_dispo: "border-red-300 bg-red-50 text-red-700",
  incertain: "border-amber-300 bg-amber-50 text-amber-700",
};

const ACTIVE_BTN: Record<AvailabilityValue, string> = {
  dispo: "bg-emerald-600 text-white border-emerald-600",
  pas_dispo: "bg-red-600 text-white border-red-600",
  incertain: "bg-amber-500 text-white border-amber-500",
};

interface WeekMatchItem {
  event: Event;
  availability: AvailabilityValue | null;
}

interface WeekMatchData {
  items: WeekMatchItem[];
}

export function WeekMatchAvailability({ playerId }: { playerId: string | null }) {
  const { currentTeam } = useTeam();
  const router = useRouter();
  const [savingEventId, setSavingEventId] = useState<string | null>(null);

  const key =
    currentTeam && playerId ? `week-match-availability:${currentTeam.id}:${playerId}` : null;

  const { data, loading, revalidate } = useQueryCache<WeekMatchData | null>(
    key,
    async () => {
      if (!currentTeam || !playerId) return null;
      const supabase = createClient();

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(todayStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { data: events } = await supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam.id)
        .eq("type", "match")
        .in("status", ["upcoming", "ongoing"])
        .is("convocations_sent_at", null)
        .gte("event_date", todayStart.toISOString())
        .lte("event_date", weekEnd.toISOString())
        .order("event_date", { ascending: true });

      const eventRows = (events as Event[]) || [];
      if (eventRows.length === 0) return { items: [] };

      const eventIds = eventRows.map((e) => e.id);
      const { data: availability } = await supabase
        .from("match_availability")
        .select("event_id, availability")
        .eq("player_id", playerId)
        .in("event_id", eventIds);

      const resMap = Object.fromEntries(
        ((availability || []) as { event_id: string; availability: AvailabilityValue }[]).map(
          (r) => [r.event_id, r.availability]
        )
      );

      return {
        items: eventRows.map((event) => ({
          event,
          availability: (resMap[event.id] as AvailabilityValue | undefined) ?? null,
        })),
      };
    },
    { ttl: 20_000 }
  );

  if (!currentTeam || !playerId) return null;
  if (loading) return null;

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  async function respond(event: Event, value: AvailabilityValue) {
    if (isEventLocked(event.event_date, event.end_date)) {
      toast.error(CONVOCATION_LOCKED_MESSAGE);
      return;
    }
    if (!playerId) return;
    setSavingEventId(event.id);
    const supabase = createClient();
    const { error } = await supabase.from("match_availability").upsert(
      {
        event_id: event.id,
        team_id: currentTeam!.id,
        player_id: playerId,
        availability: value,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "event_id,player_id" }
    );
    setSavingEventId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    clearQueryCache();
    await revalidate();
    toast.success("Réponse enregistrée");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-[var(--color-gold)]" />
          Disponibilités avant match
          {items.length > 1 && (
            <span className="text-xs font-normal text-muted-foreground ml-1">
              {items.length} matchs cette semaine
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(({ event, availability }) => {
          const locked = isEventLocked(event.event_date, event.end_date);
          const eventDate = new Date(event.event_date);
          return (
            <div
              key={event.id}
              className="rounded-lg border p-3 space-y-2.5"
            >
              <div>
                <p
                  className="font-medium text-sm cursor-pointer hover:underline inline-flex items-center gap-1.5"
                  onClick={() => router.push(`/matches/${event.id}`)}
                >
                  {event.title}
                  {event.opponent && (
                    <span className="font-normal text-muted-foreground">
                      vs {event.opponent}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className="capitalize">
                      {eventDate.toLocaleDateString("fr-FR", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      {eventDate.toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  {event.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{event.location}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(["dispo", "incertain", "pas_dispo"] as AvailabilityValue[]).map((v) => (
                  <button
                    key={v}
                    disabled={savingEventId === event.id || locked}
                    onClick={() => respond(event, v)}
                    className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                      availability === v ? ACTIVE_BTN[v] : STYLES[v]
                    } ${savingEventId === event.id || locked ? "opacity-60" : ""}`}
                  >
                    {availability === v && <Check className="h-3 w-3" />}
                    {LABELS[v]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground">
          Réponds pour aider le coach à préparer la composition. Tes réponses se
          modifient jusqu&apos;au match.
        </p>
      </CardContent>
    </Card>
  );
}