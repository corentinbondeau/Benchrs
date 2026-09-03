"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useSelectedChild } from "@/lib/useSelectedChild";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Car, Plus, MapPin, Users, Clock, Calendar, UserPlus, UserMinus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import type { CarpoolingTrip, CarpoolingBooking, Event, Profile } from "@/types";

interface BookingWithPassenger extends CarpoolingBooking {
  passenger?: Profile;
}

interface TripWithDetails extends CarpoolingTrip {
  event?: Event;
  driver?: Profile;
  bookings?: BookingWithPassenger[];
}

export default function CarpoolingPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const [trips, setTrips] = useState<TripWithDetails[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);
  const [bookingInProgress, setBookingInProgress] = useState<string | null>(null);
  const [form, setForm] = useState({ eventId: "", seats: "4", departureLocation: "", departureTime: "", notes: "" });

  const isCoach = userRole === "coach" || userRole === "owner";
  const isParent = userRole === "parent";
  const { children, selectedChildId } = useSelectedChild(currentTeam?.id);
  // Si parent : inscrire l'enfant comme passager. Sinon : l'utilisateur lui-même.
  const passengerId = isParent && selectedChildId ? selectedChildId : user?.id;

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  function fetchData() {
    const supabase = createClient();
    const teamId = currentTeam!.id;
    Promise.all([
      supabase
        .from("carpooling_trips")
        .select("*, event:events!carpooling_trips_event_id_fkey(*), driver:profiles!carpooling_trips_driver_id_fkey(first_name, last_name, avatar_url), bookings:carpooling_bookings(*, passenger:profiles!carpooling_bookings_passenger_id_fkey(first_name, last_name, avatar_url))")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("*")
        .eq("team_id", teamId)
        .eq("status", "upcoming")
        .order("event_date", { ascending: true }),
    ]).then(([tripsRes, eventsRes]) => {
      setTrips((tripsRes.data as TripWithDetails[]) || []);
      setEvents((eventsRes.data as Event[]) || []);
      setLoading(false);
    });
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, [currentTeam?.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();

    // Combiner la date de l'événement avec l'heure saisie pour créer un timestamp
    let departureTime: string | null = null;
    if (form.departureTime) {
      const selectedEvent = events.find((ev) => ev.id === form.eventId);
      if (selectedEvent) {
        const eventDate = new Date(selectedEvent.event_date);
        const [hours, minutes] = form.departureTime.split(":").map(Number);
        eventDate.setHours(hours, minutes, 0, 0);
        departureTime = eventDate.toISOString();
      }
    }

    const { error } = await supabase.from("carpooling_trips").insert({
      event_id: form.eventId,
      driver_id: user!.id,
      total_seats: parseInt(form.seats),
      departure_location: form.departureLocation || null,
      departure_time: departureTime,
      notes: form.notes || null,
      team_id: currentTeam!.id,
    });
    if (error) {
      console.error("[carpooling] insert error:", error.message, error.code, error.details);
      toast.error(`Impossible de créer le trajet : ${error.message}`);
      return;
    }
    toast.success("Trajet propose !");
    setAddOpen(false);
    setForm({ eventId: "", seats: "4", departureLocation: "", departureTime: "", notes: "" });
    fetchData();
  }

  async function joinTrip(tripId: string) {
    if (!passengerId) return;
    setBookingInProgress(tripId);
    const supabase = createClient();
    const { error } = await supabase.from("carpooling_bookings").insert({
      trip_id: tripId,
      passenger_id: passengerId,
      role: "passenger",
      seats_taken: 1,
      status: "confirmed",
      team_id: currentTeam!.id,
    });
    setBookingInProgress(null);
    if (error) {
      if (error.code === "23505") {
        toast.error("Vous etes deja inscrit dans cette voiture");
      } else {
        toast.error("Impossible de s'inscrire");
      }
      return;
    }
    toast.success("Place reservee !");
    fetchData();
  }

  async function leaveTrip(tripId: string) {
    if (!passengerId) return;
    setBookingInProgress(tripId);
    const supabase = createClient();
    const { error } = await supabase
      .from("carpooling_bookings")
      .delete()
      .eq("trip_id", tripId)
      .eq("passenger_id", passengerId)
      .eq("team_id", currentTeam!.id);
    setBookingInProgress(null);
    if (error) {
      toast.error("Impossible de se desinscrire");
      return;
    }
    toast.success("Reservation annulee");
    fetchData();
  }

  async function deleteTrip(tripId: string) {
    const supabase = createClient();
    await supabase.from("carpooling_bookings").delete().eq("trip_id", tripId).eq("team_id", currentTeam!.id);
    const { error } = await supabase.from("carpooling_trips").delete().eq("id", tripId).eq("team_id", currentTeam!.id);
    if (error) {
      toast.error("Impossible de supprimer le trajet");
      return;
    }
    toast.success("Trajet supprime");
    fetchData();
  }

  function getTripStats(trip: TripWithDetails) {
    const bookings = trip.bookings || [];
    const seatsTaken = bookings.reduce((sum, b) => sum + (b.seats_taken || 1), 0);
    const seatsAvailable = Math.max(0, trip.total_seats - seatsTaken);
    const isFull = seatsAvailable === 0;
    const isMyTrip = trip.driver_id === user?.id;
    const myBooking = bookings.find((b) => b.passenger_id === passengerId || b.passenger_id === user?.id);
    return { seatsTaken, seatsAvailable, isFull, isMyTrip, myBooking, bookings };
  }

  if (loading) {
    return (
      <div className="section-gap">
        <h1 className="text-2xl font-bold">Covoiturage</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Covoiturage</h1>
          <p className="text-sm text-muted-foreground mt-1">Organisation des trajets</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" />}>
            <Plus className="h-4 w-4 mr-1" />
            Proposer un trajet
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Proposer un trajet</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Événement *</Label>
                <select
                  value={form.eventId}
                  onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Sélectionner un événement</option>
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title} — {new Date(e.event_date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} à {new Date(e.event_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Places disponibles (hors conducteur)</Label>
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
              <Button type="submit" className="w-full bg-[var(--color-primary-blue)] text-white font-semibold" disabled={!form.eventId}>
                Proposer le trajet
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {trips.filter((t) => {
        if (!t.event?.event_date) return true;
        const d = new Date(); d.setHours(0, 0, 0, 0);
        return new Date(t.event.event_date) >= d;
      }).length === 0 ? (
        <EmptyState
          icon={Car}
          title="Aucun trajet propose"
          description="Proposez un trajet pour un evenement a venir afin d'organiser le covoiturage."
        />
      ) : (
        <div className="space-y-3">
          {trips.filter((t) => {
            if (!t.event?.event_date) return true;
            const d = new Date(); d.setHours(0, 0, 0, 0);
            return new Date(t.event.event_date) >= d;
          }).map((trip) => {
            const { seatsTaken, seatsAvailable, isFull, isMyTrip, myBooking, bookings } = getTripStats(trip);
            const isExpanded = expandedTrip === trip.id;
            const eventDate = trip.event?.event_date ? new Date(trip.event.event_date) : null;

            return (
              <div key={trip.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Main row */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Driver avatar */}
                    <Avatar className="h-10 w-10 shrink-0">
                      {trip.driver?.avatar_url ? (
                        <img src={trip.driver.avatar_url} alt={trip.driver?.first_name || "Conducteur"} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <AvatarFallback className="bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-sm font-bold">
                          {trip.driver ? `${trip.driver.first_name?.[0] || ""}${trip.driver.last_name?.[0] || ""}` : "?"}
                        </AvatarFallback>
                      )}
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      {/* Event + driver */}
                      <p className="font-semibold text-sm truncate">
                        {trip.event?.title || "Evenement"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {trip.driver?.first_name} {trip.driver?.last_name}
                        {isMyTrip && <span className="text-[var(--color-primary-blue)] ml-1">(vous)</span>}
                      </p>

                      {/* Details */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                        {eventDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {eventDate.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
                            {" à "}
                            {eventDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {trip.departure_time && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Départ {new Date(trip.departure_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {trip.departure_location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{trip.departure_location}</span>
                          </span>
                        )}
                      </div>

                      {trip.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic">{trip.notes}</p>
                      )}
                    </div>

                    {/* Seats indicator + action */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {/* Seats badge */}
                      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                        isFull
                          ? "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                          : "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]"
                      }`}>
                        <Users className="h-3.5 w-3.5" />
                        {seatsTaken}/{trip.total_seats}
                      </div>

                      {/* Action button */}
                      {!isMyTrip && !myBooking && !isFull && (
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1 bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold touch-manipulation"
                          disabled={bookingInProgress === trip.id}
                          onClick={() => joinTrip(trip.id)}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          {bookingInProgress === trip.id ? "..." : "S'inscrire"}
                        </Button>
                      )}
                      {!isMyTrip && myBooking && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1 text-[var(--color-danger)] border-[var(--color-danger)]/30 hover:bg-red-50 dark:hover:bg-red-950/20 touch-manipulation"
                          disabled={bookingInProgress === trip.id}
                          onClick={() => leaveTrip(trip.id)}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          {bookingInProgress === trip.id ? "..." : "Se desinscrire"}
                        </Button>
                      )}
                      {!isMyTrip && !myBooking && isFull && (
                        <Badge variant="secondary" className="text-[10px]">Complet</Badge>
                      )}
                    </div>
                  </div>

                  {/* Passenger summary + expand */}
                  {bookings.length > 0 && (
                    <button
                      className="flex items-center gap-2 mt-3 pt-3 border-t border-border w-full text-left"
                      onClick={() => setExpandedTrip(isExpanded ? null : trip.id)}
                    >
                      {/* Stacked avatars */}
                      <div className="flex -space-x-2">
                        {bookings.slice(0, 4).map((b) => (
                          <Avatar key={b.id} className="h-6 w-6 border-2 border-card">
                            <AvatarFallback className="bg-muted text-[9px] font-bold">
                              {b.passenger ? `${b.passenger.first_name?.[0] || ""}${b.passenger.last_name?.[0] || ""}` : "?"}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {bookings.length > 4 && (
                          <Avatar className="h-6 w-6 border-2 border-card">
                            <AvatarFallback className="bg-muted text-[9px] font-bold">+{bookings.length - 4}</AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-1">
                        {bookings.length} passager{bookings.length > 1 ? "s" : ""} &middot; {seatsAvailable} place{seatsAvailable > 1 ? "s" : ""} restante{seatsAvailable > 1 ? "s" : ""}
                      </span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  )}

                  {bookings.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                      {trip.total_seats} place{trip.total_seats > 1 ? "s" : ""} disponible{trip.total_seats > 1 ? "s" : ""} &middot; Aucun passager inscrit
                    </p>
                  )}
                </div>

                {/* Expanded: passenger list */}
                {isExpanded && bookings.length > 0 && (
                  <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Passagers</p>
                    {bookings.map((b) => (
                      <div key={b.id} className="flex items-center gap-3">
                        <Avatar className="h-7 w-7">
                          {b.passenger?.avatar_url ? (
                            <img src={b.passenger.avatar_url} alt={b.passenger?.first_name || "Passager"} className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <AvatarFallback className="bg-muted text-[10px] font-bold">
                              {b.passenger ? `${b.passenger.first_name?.[0] || ""}${b.passenger.last_name?.[0] || ""}` : "?"}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <span className="text-sm flex-1">
                          {b.passenger?.first_name} {b.passenger?.last_name}
                          {(b.passenger_id === user?.id || b.passenger_id === passengerId) && <span className="text-[var(--color-primary-blue)] text-xs ml-1">(vous)</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {b.seats_taken || 1} place{(b.seats_taken || 1) > 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Owner actions */}
                {(isMyTrip || isCoach) && (
                  <div className="border-t border-border px-4 py-2 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-[var(--color-danger)]"
                      onClick={() => deleteTrip(trip.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
