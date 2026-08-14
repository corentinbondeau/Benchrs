"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bus, Check, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { notifyDeparture } from "@/lib/playerAlerts";

interface Props {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  location: string | null;
  url: string;
  departureAt: string | null;
  arrivalAt: string | null;
  onSent: (kind: "depart" | "arrival", at: string) => void;
}

export function DepartureNotifier({
  eventId,
  teamId,
  isCoach,
  location,
  url,
  departureAt,
  arrivalAt,
  onSent,
}: Props) {
  const [sending, setSending] = useState<"depart" | "arrival" | null>(null);

  if (!isCoach) {
    if (!departureAt && !arrivalAt) return null;
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="font-medium flex items-center gap-1.5">
          <Bus className="h-4 w-4 text-muted-foreground" />
          {departureAt ? "L'équipe est partie" : "L'équipe est arrivée"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {departureAt
            ? `Départ signalé le ${new Date(departureAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : `Arrivée signalée le ${new Date(arrivalAt!).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
        </p>
      </div>
    );
  }

  async function send(kind: "depart" | "arrival") {
    setSending(kind);
    try {
      const at = new Date().toISOString();
      const supabase = createClient();
      const field = kind === "depart" ? "departure_notified_at" : "arrival_notified_at";
      const { error } = await supabase.from("events").update({ [field]: at }).eq("id", eventId);
      if (error) throw error;
      await notifyDeparture({ eventId, teamId, location, kind, url });
      onSent(kind, at);
      toast.success(kind === "depart" ? "Départ signalé aux joueurs et parents" : "Arrivée signalée aux joueurs et parents");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium flex items-center gap-1.5">
        <Bus className="h-4 w-4 text-[var(--color-royal)]" />
        Signaler le départ / l&apos;arrivée
      </p>
      {location && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {location}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={departureAt ? "outline" : "default"}
          className={!departureAt ? "bg-[var(--color-primary-blue)] text-white font-semibold" : ""}
          disabled={!!departureAt || sending !== null}
          onClick={() => send("depart")}
        >
          {sending === "depart" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : departureAt ? (
            <Check className="h-4 w-4 mr-1" />
          ) : (
            <Bus className="h-4 w-4 mr-1" />
          )}
          {departureAt ? "Départ envoyé" : "On est parti"}
        </Button>
        <Button
          size="sm"
          variant={arrivalAt ? "outline" : "default"}
          className={!arrivalAt ? "bg-[var(--color-navy)] text-white font-semibold" : ""}
          disabled={!!arrivalAt || sending !== null}
          onClick={() => send("arrival")}
        >
          {sending === "arrival" ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : arrivalAt ? (
            <Check className="h-4 w-4 mr-1" />
          ) : (
            <MapPin className="h-4 w-4 mr-1" />
          )}
          {arrivalAt ? "Arrivée envoyée" : "Arrivés au stade"}
        </Button>
      </div>
    </div>
  );
}
