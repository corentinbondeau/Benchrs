"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { selectNextSession } from "@/lib/sessionSelection";
import { SessionFormCheckIn } from "@/components/training/SessionFormCheckIn";
import type { Event } from "@/types";

interface NextSessionData {
  event: Event;
}

export function NextSessionCheckIn() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();

  const key = currentTeam && user?.id ? `next-session:${currentTeam.id}:${user.id}` : null;

  const { data } = useQueryCache<NextSessionData | null>(
    key,
    async () => {
      const supabase = createClient();
      const { data: events } = await supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .eq("type", "training")
        .gt("event_date", new Date().toISOString())
        .order("event_date", { ascending: true })
        .limit(10);

      const eventRows = (events as Event[]) || [];
      if (eventRows.length === 0) return null;

      const eventIds = eventRows.map((e) => e.id);
      const { data: attendances } = await supabase
        .from("attendances")
        .select("event_id, user_id, status")
        .eq("user_id", user!.id)
        .in("event_id", eventIds);

      const selectedId = selectNextSession({
        events: eventRows,
        attendances: attendances || [],
        playerId: user!.id,
      });

      if (!selectedId) return null;

      const event = eventRows.find((e) => e.id === selectedId);
      return event ? { event } : null;
    },
    { ttl: 60_000 }
  );

  if (!currentTeam || !user?.id || !data) return null;

  const { event } = data;
  const dateStr = new Date(event.event_date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Prochaine séance : {event.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{dateStr}</p>
      </div>
      <SessionFormCheckIn
        eventId={event.id}
        teamId={currentTeam.id}
        isCoach={false}
        userId={user.id}
        userRole={userRole}
        childId={null}
        eventDate={event.event_date}
      />
    </div>
  );
}
