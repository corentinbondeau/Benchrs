"use client";

import { memo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { useQueryCache } from "@/lib/queryCache";
import type { Event } from "@/types";
import { Calendar, MapPin, Clock, ChevronRight, Users } from "lucide-react";

function NextEventCard() {
  const router = useRouter();
  const { currentTeam } = useTeam();
  const { data: event, loading } = useQueryCache<Event | null>(
    currentTeam ? `events:next:${currentTeam.id}` : null,
    async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("events")
        .select("id, title, event_date, type, status, opponent, location")
        .eq("team_id", currentTeam!.id)
        .in("status", ["upcoming", "ongoing"])
        .gte("event_date", new Date().toISOString())
        .order("event_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      return (data as Event | null) || null;
    },
    { ttl: 60_000 }
  );

  if (!currentTeam) return null;

  if (loading) {
    return (
      <div className="rounded-xl bg-[var(--color-navy)] p-5">
        <div className="h-28 animate-pulse rounded-lg bg-white/10" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-10 px-6">
        <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">Aucun evenement a venir</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Votre prochain rendez-vous apparaitra ici
        </p>
      </div>
    );
  }

  const eventDate = new Date(event.event_date);
  const now = new Date();
  const diffMs = eventDate.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  let countdown = "";
  if (diffDays > 1) countdown = `Dans ${diffDays} jours`;
  else if (diffDays === 1) countdown = "Demain";
  else if (diffHours > 0) countdown = `Dans ${diffHours}h`;
  else countdown = "Maintenant";

  const isMatch = event.type === "match";
  const typeLabel = isMatch ? "Prochain match" : "Prochain entrainement";

  return (
    <button
      onClick={() => router.push(isMatch ? `/matches/${event.id}` : `/trainings/${event.id}`)}
      className="w-full text-left rounded-xl bg-[var(--color-navy)] text-white p-5 md:p-6 hover:bg-[var(--color-navy-light)] transition-colors group"
    >
      {/* Top: label + countdown */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
          {typeLabel}
        </span>
        <span className="inline-flex items-center rounded-md bg-[var(--color-primary-blue)] px-2.5 py-1 text-xs font-bold text-white">
          {countdown}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold truncate">
        {isMatch && event.opponent
          ? `${currentTeam?.name || "Equipe"} vs ${event.opponent}`
          : event.title}
      </h3>

      {/* Details row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[13px] text-white/55">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span className="capitalize">
            {eventDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {eventDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {event.location && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{event.location}</span>
          </span>
        )}
      </div>

      {/* CTA */}
      <div className="flex items-center gap-2 mt-4 text-sm font-medium text-white/70 group-hover:text-white transition-colors">
        Ouvrir {isMatch ? "le match" : "l'entrainement"}
        <ChevronRight className="h-4 w-4" />
      </div>
    </button>
  );
}

export default memo(NextEventCard);
