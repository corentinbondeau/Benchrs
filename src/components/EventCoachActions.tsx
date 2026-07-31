"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarClock, Pencil, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { Event } from "@/types";

export type EventWithMeeting = Event & { meeting_time: string | null };

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function notifyPlayers(
  eventId: string,
  teamId: string,
  isMatch: boolean,
  title: string,
  body: string,
  type: "event_cancelled" | "event_rescheduled"
) {
  const supabase = createClient();
  const { data: atts } = await supabase
    .from("attendances")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("team_id", teamId);
  const userIds = (atts || []).map((a) => a.user_id);
  if (userIds.length === 0) return;
  await fetch("/api/notifications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_ids: userIds,
      title,
      body,
      type,
      reference_id: eventId,
      team_id: teamId,
      url: isMatch ? `/matches/${eventId}` : `/trainings/${eventId}`,
    }),
  });
}

export function EventCoachActions({
  event,
  isMatch,
  onSaved,
}: {
  event: EventWithMeeting;
  isMatch: boolean;
  onSaved: (updated: EventWithMeeting) => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [reportDate, setReportDate] = useState(() => toDatetimeLocalValue(event.event_date));
  const [reportMeeting, setReportMeeting] = useState(event.meeting_time?.slice(0, 5) || "");

  const [editTitle, setEditTitle] = useState(event.title);
  const [editDate, setEditDate] = useState(() => toDatetimeLocalValue(event.event_date));
  const [editMeeting, setEditMeeting] = useState(event.meeting_time?.slice(0, 5) || "");
  const [editLocation, setEditLocation] = useState(event.location || "");
  const [editOpponent, setEditOpponent] = useState(event.opponent || "");

  function openEdit() {
    setEditTitle(event.title);
    setEditDate(toDatetimeLocalValue(event.event_date));
    setEditMeeting(event.meeting_time?.slice(0, 5) || "");
    setEditLocation(event.location || "");
    setEditOpponent(event.opponent || "");
    setEditOpen(true);
  }

  function openReport() {
    setReportDate(toDatetimeLocalValue(event.event_date));
    setReportMeeting(event.meeting_time?.slice(0, 5) || "");
    setReportOpen(true);
  }

  async function saveReport() {
    if (!reportDate) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({
        event_date: new Date(reportDate).toISOString(),
        meeting_time: reportMeeting || null,
      })
      .eq("id", event.id)
      .eq("team_id", event.team_id);

    if (error) {
      toast.error(`Erreur lors du report : ${error.message}`);
      setSaving(false);
      return;
    }

    const updated = {
      ...event,
      event_date: new Date(reportDate).toISOString(),
      meeting_time: reportMeeting || null,
    };
    onSaved(updated);
    setSaving(false);
    setReportOpen(false);
    toast.success("Événement reporté");
    await notifyPlayers(
      event.id,
      event.team_id,
      isMatch,
      `Événement reporté : ${event.title}`,
      `L'événement a été déplacé au ${new Date(updated.event_date).toLocaleDateString("fr-FR")} ${new Date(updated.event_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
      "event_rescheduled"
    );
  }

  async function saveEdit() {
    if (!editTitle.trim() || !editDate) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("events")
      .update({
        title: editTitle.trim(),
        event_date: new Date(editDate).toISOString(),
        meeting_time: editMeeting || null,
        location: editLocation.trim() || null,
        opponent: isMatch && editOpponent.trim() ? editOpponent.trim() : null,
      })
      .eq("id", event.id)
      .eq("team_id", event.team_id);

    if (error) {
      toast.error(`Erreur lors de la modification : ${error.message}`);
      setSaving(false);
      return;
    }

    onSaved({
      ...event,
      title: editTitle.trim(),
      event_date: new Date(editDate).toISOString(),
      meeting_time: editMeeting || null,
      location: editLocation.trim() || null,
      opponent: isMatch && editOpponent.trim() ? editOpponent.trim() : null,
    });
    setSaving(false);
    setEditOpen(false);
    toast.success("Événement modifié");
  }

  async function saveCancel() {
    setSaving(true);
    const supabase = createClient();
    const nextStatus = event.status === "cancelled" ? "upcoming" : "cancelled";
    const { error } = await supabase
      .from("events")
      .update({ status: nextStatus })
      .eq("id", event.id)
      .eq("team_id", event.team_id);

    if (error) {
      toast.error(`Erreur : ${error.message}`);
      setSaving(false);
      return;
    }

    onSaved({ ...event, status: nextStatus });
    setSaving(false);
    setCancelOpen(false);
    if (nextStatus === "cancelled") {
      toast.success("Événement annulé");
      await notifyPlayers(
        event.id,
        event.team_id,
        isMatch,
        `Événement annulé : ${event.title}`,
        `L'événement du ${new Date(event.event_date).toLocaleDateString("fr-FR")} est annulé.`,
        "event_cancelled"
      );
    } else {
      toast.success("Événement réactivé");
    }
  }

  const isCancelled = event.status === "cancelled";

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
        onClick={openReport}
      >
        <CalendarClock className="h-3.5 w-3.5 mr-1" />
        Reporter
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
        onClick={openEdit}
      >
        <Pencil className="h-3.5 w-3.5 mr-1" />
        Modifier
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={`${isCancelled ? "bg-green-500/80 border-green-400/30 text-white hover:bg-green-500" : "bg-red-500/80 border-red-400/30 text-white hover:bg-red-500"}`}
        onClick={() => setCancelOpen(true)}
      >
        {isCancelled ? (
          <><RotateCcw className="h-3.5 w-3.5 mr-1" />Réactiver</>
        ) : (
          <><XCircle className="h-3.5 w-3.5 mr-1" />Annuler</>
        )}
      </Button>

      {/* Reporter */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reporter l&apos;événement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Date et heure *</Label>
              <Input
                type="datetime-local"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Heure de RDV</Label>
              <Input
                type="time"
                value={reportMeeting}
                onChange={(e) => setReportMeeting(e.target.value)}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setReportOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                disabled={!reportDate || saving}
                onClick={saveReport}
              >
                {saving ? "..." : "Reporter"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modifier */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;événement</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Titre *</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Date et heure *</Label>
              <Input
                type="datetime-local"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Heure de RDV</Label>
              <Input type="time" value={editMeeting} onChange={(e) => setEditMeeting(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Lieu</Label>
              <Input value={editLocation} onChange={(e) => setEditLocation(e.target.value)} placeholder="Stade, terrain..." />
            </div>
            {isMatch && (
              <div className="space-y-2">
                <Label>Adversaire</Label>
                <Input value={editOpponent} onChange={(e) => setEditOpponent(e.target.value)} placeholder="Nom de l'équipe adverse" />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => setEditOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                disabled={!editTitle.trim() || !editDate || saving}
                onClick={saveEdit}
              >
                {saving ? "..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Annuler / Réactiver */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCancelled ? "Réactiver l'événement" : "Annuler l'événement"}
            </DialogTitle>
            <DialogDescription>
              {isCancelled
                ? "L'événement redevient planifié."
                : "Les joueurs convoqués seront notifiés de l'annulation."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setCancelOpen(false)}>
              Retour
            </Button>
            <Button
              type="button"
              className={`flex-1 font-semibold ${isCancelled ? "bg-green-600 text-white hover:bg-green-700" : "bg-red-600 text-white hover:bg-red-700"}`}
              disabled={saving}
              onClick={saveCancel}
            >
              {saving ? "..." : isCancelled ? "Réactiver" : "Confirmer l'annulation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
