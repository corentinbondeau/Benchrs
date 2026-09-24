"use client";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useQueryCache } from "@/lib/queryCache";
import { isRpeFormOpen, getEventDurationMinutes } from "@/lib/event-lock";
import { SessionRpe } from "@/components/training/SessionRpe";
import { reloadAfterSave } from "@/lib/reloadAfterSave";
import type { Event } from "@/types";

interface LastMatchData {
  event: Event;
}

export function LastMatchFeedback() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();

  const key =
    currentTeam && user?.id ? `last-match-rpe:${currentTeam.id}:${user.id}` : null;

  const { data } = useQueryCache<LastMatchData | null>(
    key,
    async () => {
      if (!currentTeam || !user?.id) return null;
      const supabase = createClient();

      const { data: settings } = await supabase
        .from("team_settings")
        .select("enable_rpe")
        .eq("team_id", currentTeam.id)
        .maybeSingle();
      if (settings?.enable_rpe !== true) return null;

      const { data: events } = await supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam.id)
        .eq("type", "match")
        .neq("status", "cancelled")
        .lt("event_date", new Date().toISOString())
        .order("event_date", { ascending: false })
        .limit(10);

      const rows = (events as Event[]) || [];
      if (rows.length === 0) return null;

      const match = rows.find((e) => isRpeFormOpen(e.event_date, e.end_date));
      if (!match) return null;

      const { data: rpe } = await supabase
        .from("session_rpe")
        .select("id")
        .eq("event_id", match.id)
        .eq("player_id", user.id)
        .maybeSingle();
      if (rpe) return null;

      return { event: match };
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
          Dernier match : {event.opponent || event.title || "Match"}
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
        trainingOver={isRpeFormOpen(event.event_date, event.end_date)}
        durationHint={getEventDurationMinutes(event.event_date, event.end_date) ?? 120}
        onSubmitted={() => reloadAfterSave()}
      />
    </div>
  );
}