"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { fetchTeamRecipientIds } from "@/lib/playerAlerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, CalendarClock } from "lucide-react";
import { toast } from "sonner";

export function TerrainImpraticable({
  event,
  teamId,
  isCoach,
  url,
}: {
  event: { id: string; type: string; title: string; status: string };
  teamId: string;
  isCoach: boolean;
  url: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Terrain impraticable");
  const [busy, setBusy] = useState(false);

  // Étape report
  const [reporting, setReporting] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [sending, setSending] = useState(false);

  if (!isCoach || event.status !== "upcoming") return null;

  async function cancelEvent() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("events")
        .update({ status: "cancelled", cancel_reason: reason.trim() || "Terrain impraticable" })
        .eq("id", event.id);
      if (error) throw error;
      const recipients = await fetchTeamRecipientIds(teamId);
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: recipients,
          title: `${event.type === "match" ? "Match" : "Entraînement"} annulé : terrain impraticable`,
          body: `« ${event.title} » est annulé. Motif : ${reason.trim() || "Terrain impraticable"}.`,
          type: "terrain_impraticable",
          reference_id: `${event.id}:terrain`,
          team_id: teamId,
          url,
        }),
      });
      toast.success("Événement annulé et familles prévenues");
      setOpen(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmReport() {
    if (!newDate) {
      toast.error("Choisis une nouvelle date");
      return;
    }
    setSending(true);
    try {
      const supabase = createClient();
      const sourceRes = await supabase
        .from("events")
        .select("*")
        .eq("id", event.id)
        .single();
      const source = sourceRes.data as Record<string, unknown> | null;

      const dateTime = new Date(`${newDate}T${newTime || "19:00"}:00`);
      const sourceEventDate = source?.event_date ? new Date(source.event_date as string) : null;
      const sourceEndDate = source?.end_date ? new Date(source.end_date as string) : null;
      const durationMs =
        sourceEventDate && sourceEndDate
          ? sourceEndDate.getTime() - sourceEventDate.getTime()
          : null;
      const newEndDate =
        durationMs !== null && durationMs > 0
          ? new Date(dateTime.getTime() + durationMs).toISOString()
          : null;
      const { data: newEvent, error } = await supabase
        .from("events")
        .insert({
          type: source?.type ?? "match",
          title: source?.title ?? event.title,
          description: source?.description ?? null,
          event_date: dateTime.toISOString(),
          end_date: newEndDate,
          location: newLocation.trim() || source?.location || null,
          map_url: source?.map_url ?? null,
          status: "upcoming",
          opponent: source?.opponent ?? null,
          meeting_time: source?.meeting_time ?? null,
          team_id: teamId,
        })
        .select("id")
        .single();
      if (error) throw error;

      const recipients = await fetchTeamRecipientIds(teamId);
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: recipients,
          title: `${event.type === "match" ? "Match" : "Entraînement"} reporté`,
          body: `Le match est reporté au ${dateTime.toLocaleDateString("fr-FR")} à ${dateTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Merci de confirmer votre présence.`,
          type: "convocation",
          reference_id: newEvent.id,
          team_id: teamId,
          url,
        }),
      });
      toast.success("Nouvelle date créée et familles convoquées");
      setOpen(false);
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs text-red-600 border-red-200 bg-red-50 hover:bg-red-100"
        onClick={() => setOpen(true)}
      >
        <AlertTriangle className="h-3.5 w-3.5 mr-1" />
        Terrain impraticable
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Annuler pour terrain impraticable
            </DialogTitle>
            <DialogDescription>
              « {event.title} » sera annulé et toutes les familles seront prévenues automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Motif</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="text-sm" rows={2} />
          </div>
          {reporting && (
            <div className="space-y-2 rounded-lg bg-muted/40 p-3">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-[var(--color-gold)]" />
                Proposer un report
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="text-sm h-8" />
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="text-sm h-8" />
              </div>
              <Input
                placeholder="Lieu (laissé vide = même lieu)"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                className="text-sm h-8"
              />
            </div>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || sending}
              onClick={() => {
                setReporting(!reporting);
                if (!reporting) {
                  setNewDate("");
                  setNewTime("");
                }
              }}
            >
              {reporting ? "Annuler le report" : "Annuler + proposer un report"}
            </Button>
            {reporting ? (
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={confirmReport} disabled={sending}>
                {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Annuler et reporter
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={cancelEvent} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Annuler simplement
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
