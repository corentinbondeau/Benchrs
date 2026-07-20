"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TripCard, TripForm } from "@/components/carpooling/TripCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { CarpoolingTrip, Event } from "@/types";

export default function CarpoolingPage() {
  const [trips, setTrips] = useState<(CarpoolingTrip & { event: Event })[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      const [tripsRes, eventsRes] = await Promise.all([
        supabase
          .from("carpooling_trips")
          .select("*, event:events!carpooling_trips_event_id_fkey(*)")
          .order("created_at", { ascending: false }),
        supabase
          .from("events")
          .select("*")
          .eq("status", "upcoming")
          .order("event_date", { ascending: true }),
      ]);

      setTrips((tripsRes.data as (CarpoolingTrip & { event: Event })[]) || []);
      setEvents((eventsRes.data as Event[]) || []);
      setLoading(false);
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Covoiturage</h2>
          <p className="text-muted-foreground mt-1">
            Organisation des trajets pour les matchs à l&apos;extérieur
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90" />}>
              <Plus className="h-4 w-4 mr-1" />
              Proposer un trajet
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau trajet</DialogTitle>
            </DialogHeader>
            {events.length > 0 && (
              <div className="space-y-4">
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                >
                  <option value="">Sélectionner un événement</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title} —{" "}
                      {new Date(event.event_date).toLocaleDateString("fr-FR")}
                    </option>
                  ))}
                </select>
                {selectedEventId && (
                  <TripForm
                    eventId={selectedEventId}
                    onClose={() => setDialogOpen(false)}
                  />
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {trips.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <p className="text-sm">Aucun trajet proposé</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
