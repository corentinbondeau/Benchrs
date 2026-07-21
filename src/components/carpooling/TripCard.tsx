"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Car, Users, MapPin } from "lucide-react";
import type { CarpoolingTrip } from "@/types";

export function TripCard({ trip }: { trip: CarpoolingTrip }) {
  const { data: session } = useSession();
  const [bookingCount, setBookingCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    async function count() {
      const { count } = await supabase
        .from("carpooling_bookings")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", trip.id);
      setBookingCount(count || 0);
    }
    count();
  }, [trip.id]);

  async function bookSeat() {
    if (!session?.user?.id) return;
    const supabase = createClient();
    await supabase.from("carpooling_bookings").insert({
      trip_id: trip.id,
      passenger_id: session.user.id,
      role: "passenger",
      seats_taken: 1,
      status: "confirmed",
    });
    setBookingCount((prev) => prev + 1);
  }

  const availableSeats = trip.total_seats - bookingCount;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Car className="h-4 w-4 text-[var(--royal)]" />
              <span className="font-medium text-sm">
                Trajet vers{" "}
                {trip.event?.location || "lieu du match"}
              </span>
            </div>
            {trip.departure_location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {trip.departure_location}
              </div>
            )}
            {trip.departure_time && (
              <p className="text-sm text-muted-foreground">
                Départ :{" "}
                {new Date(trip.departure_time).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-3 w-3" />
              <span>
                {availableSeats} place{availableSeats !== 1 ? "s" : ""}{" "}
                disponible{availableSeats !== 1 ? "s" : ""} / {trip.total_seats}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            disabled={availableSeats <= 0}
            onClick={bookSeat}
            className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
          >
            Réserver
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function TripForm({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { data: session } = useSession();
  const [formData, setFormData] = useState({
    totalSeats: 4,
    departureLocation: "",
    departureTime: "",
    notes: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;

    const supabase = createClient();
    await supabase.from("carpooling_trips").insert({
      event_id: eventId,
      driver_id: session.user.id,
      total_seats: formData.totalSeats,
      departure_location: formData.departureLocation || null,
      departure_time: formData.departureTime || null,
      notes: formData.notes || null,
    });

    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nombre de places</Label>
        <Input
          type="number"
          min={1}
          max={9}
          value={formData.totalSeats}
          onChange={(e) =>
            setFormData({ ...formData, totalSeats: parseInt(e.target.value) || 4 })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Lieu de départ</Label>
        <Input
          placeholder="Ex: Parking Carrefour"
          value={formData.departureLocation}
          onChange={(e) =>
            setFormData({ ...formData, departureLocation: e.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Heure de départ</Label>
        <Input
          type="time"
          value={formData.departureTime}
          onChange={(e) =>
            setFormData({ ...formData, departureTime: e.target.value })
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          placeholder="Informations supplémentaires..."
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>
      <Button
        type="submit"
        className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
      >
        Proposer un trajet
      </Button>
    </form>
  );
}
