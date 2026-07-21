"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Car, Plus, MapPin, Users } from "lucide-react";
import type { CarpoolingTrip, Event, Profile } from "@/types";

interface TripWithDetails extends CarpoolingTrip {
  event?: Event;
  driver?: Profile;
}

export default function CarpoolingPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<TripWithDetails[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ eventId: "", seats: "4", departureLocation: "", departureTime: "", notes: "" });

  function fetchData() {
    const supabase = createClient();
    Promise.all([
      supabase.from("carpooling_trips").select("*, event:events!carpooling_trips_event_id_fkey(*), driver:profiles!carpooling_trips_driver_id_fkey(first_name, last_name)").order("created_at", { ascending: false }),
      supabase.from("events").select("*").eq("status", "upcoming").order("event_date", { ascending: true }),
    ]).then(([tripsRes, eventsRes]) => {
      setTrips((tripsRes.data as TripWithDetails[]) || []);
      setEvents((eventsRes.data as Event[]) || []);
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    await supabase.from("carpooling_trips").insert({
      event_id: form.eventId,
      driver_id: user!.id,
      total_seats: parseInt(form.seats),
      departure_location: form.departureLocation || null,
      departure_time: form.departureTime || null,
      notes: form.notes || null,
    });
    setAddOpen(false);
    setForm({ eventId: "", seats: "4", departureLocation: "", departureTime: "", notes: "" });
    fetchData();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Covoiturage</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Covoiturage</h2>
          <p className="text-muted-foreground mt-1">Organisation des trajets</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
            <Plus className="h-4 w-4 mr-1" />
            Proposer
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouveau trajet</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Evenement *</Label>
                <Select value={form.eventId} onValueChange={(v) => setForm({ ...form, eventId: v ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Selectionner" /></SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.title} - {new Date(e.event_date).toLocaleDateString("fr-FR")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Places disponibles</Label>
                <Input type="number" min="1" max="9" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Lieu de depart</Label>
                <Input value={form.departureLocation} onChange={(e) => setForm({ ...form, departureLocation: e.target.value })} placeholder="Adresse, parking..." />
              </div>
              <div className="space-y-2">
                <Label>Heure de depart</Label>
                <Input type="time" value={form.departureTime} onChange={(e) => setForm({ ...form, departureTime: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Infos complementaires..." />
              </div>
              <Button type="submit" className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold" disabled={!form.eventId}>
                Proposer le trajet
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {trips.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <p className="text-sm">Aucun trajet propose</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <Card key={trip.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Car className="h-4 w-4 text-[var(--color-royal)]" />
                  {trip.event?.title || "Evenement"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Chauffeur:</span> {trip.driver?.first_name} {trip.driver?.last_name}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {trip.total_seats} place{trip.total_seats > 1 ? "s" : ""}
                </div>
                {trip.departure_location && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {trip.departure_location}
                  </div>
                )}
                <Badge variant="secondary">
                  {new Date(trip.event?.event_date || "").toLocaleDateString("fr-FR")}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
