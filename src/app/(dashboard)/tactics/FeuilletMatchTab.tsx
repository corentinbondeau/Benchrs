"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import type { Event } from "@/types";
import { LineupEditor } from "@/components/lineup/LineupEditor";

export default function FeuilletMatchTab() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const supabase = createClient();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [loading, setLoading] = useState(true);
  const [matchFormat, setMatchFormat] = useState(11);

  // Fetch events + team_settings
  useEffect(() => {
    if (!currentTeam) return;
    Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam.id)
        .eq("type", "match")
        .order("event_date", { ascending: false }),
      supabase
        .from("team_settings")
        .select("match_format")
        .eq("team_id", currentTeam.id)
        .maybeSingle(),
    ]).then(([eventsRes, settingsRes]) => {
      setEvents((eventsRes.data as Event[]) || []);
      const fmt = (settingsRes.data as { match_format?: number } | null)?.match_format;
      if (fmt) setMatchFormat(fmt);
      setLoading(false);
    });
  }, [currentTeam]);

  if (loading) {
    return <div className="flex h-48 items-center justify-center text-muted-foreground">Chargement...</div>;
  }

  if (!currentTeam) {
    return <div className="flex h-48 items-center justify-center text-muted-foreground">Chargement de l&apos;équipe...</div>;
  }

  return (
    <LineupEditor
      eventId={selectedEventId || null}
      teamId={currentTeam.id}
      userId={user?.id || null}
      isCoach={isCoach}
      showEventPicker
      events={events}
      onEventChange={(id) => setSelectedEventId(id)}
      matchFormat={matchFormat}
    />
  );
}
