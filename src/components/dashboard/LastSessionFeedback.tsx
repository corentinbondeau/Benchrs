"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { selectLastSession } from "@/lib/lastSession";
import { SessionRpe } from "@/components/training/SessionRpe";
import { SessionFeedback } from "@/components/training/SessionFeedback";
import type { Event } from "@/types";

interface LastSessionData {
  event: Event;
}

export function LastSessionFeedback() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();

  const key = currentTeam && user?.id ? `last-session:${currentTeam.id}:${user.id}` : null;

  const { data } = useQueryCache<LastSessionData | null>(
    key,
    async () => {
      const supabase = createClient();
      const { data: events } = await supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .eq("type", "training")
        .lt("event_date", new Date().toISOString())
        .order("event_date", { ascending: false })
        .limit(10);

      const eventRows = (events as Event[]) || [];
      if (eventRows.length === 0) return null;

      const eventIds = eventRows.map((e) => e.id);
      const { data: attendances } = await supabase
        .from("attendances")
        .select("event_id, user_id, status")
        .eq("user_id", user!.id)
        .in("event_id", eventIds);

      const selectedId = selectLastSession({
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
          Dernière séance : {event.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{dateStr}</p>
      </div>
      <SessionRpe
        eventId={event.id}
        teamId={currentTeam.id}
        isCoach={false}
        userId={user.id}
        userRole={userRole}
        childId={null}
        trainingOver={true}
        durationHint={90}
      />
      <SessionFeedback
        eventId={event.id}
        teamId={currentTeam.id}
        isCoach={false}
        userId={user.id}
        userRole={userRole}
        childId={null}
        trainingOver={true}
      />
    </div>
  );
}
