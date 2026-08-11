"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
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
import { CalendarClock, Pencil, RotateCcw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { clearQueryCache } from "@/lib/queryCache";
import { LocationPicker } from "@/components/calendar/LocationPicker";
import type { Event } from "@/types";

export type EventWithMeeting = Event & { meeting_time: string | null };

type Scope = "single" | "all";

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
  await authFetch("/api/notifications/send", {
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

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR");
}

function ScopeToggle({
  scope,
  onChange,
  groupCount,
  show,
}: {
  scope: Scope;
  onChange: (s: Scope) => void;
  groupCount: number;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
      <button
        type="button"
        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${scope === "single" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => onChange("single")}
      >
        Cet événement
      </button>
      <button
        type="button"
        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${scope === "all" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => onChange("all")}
      >
        Toutes les occurrences ({groupCount})
      </button>
    </div>
  );
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
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<Scope>("single");
  const [groupCount, setGroupCount] = useState(1);

  const [reportDate, setReportDate] = useState(() => toDatetimeLocalValue(event.event_date));
  const [reportMeeting, setReportMeeting] = useState(event.meeting_time?.slice(0, 5) || "");

  const [editTitle, setEditTitle] = useState(event.title);
  const [editDate, setEditDate] = useState(() => toDatetimeLocalValue(event.event_date));
  const [editMeeting, setEditMeeting] = useState(event.meeting_time?.slice(0, 5) || "");
  const [editLocation, setEditLocation] = useState(event.location || "");
  const [editOpponent, setEditOpponent] = useState(event.opponent || "");

  useEffect(() => {
    if (!event.recurrence_group_id) return;
    const supabase = createClient();
    supabase
      .from("events")
      .select("id")
      .eq("recurrence_group_id", event.recurrence_group_id)
      .eq("team_id", event.team_id)
      .then(({ data }) => {
        setGroupCount((data || []).length);
      });
  }, [event.recurrence_group_id, event.team_id]);

  const hasRecurrences = groupCount > 1;

  function openEdit() {
    setScope("single");
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
    clearQueryCache();
    await notifyPlayers(
      event.id,
      event.team_id,
      isMatch,
      `Événement reporté : ${event.title}`,
      `L'événement a été déplacé au ${formatEventDate(updated.event_date)} ${new Date(updated.event_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
      "event_rescheduled"
    );
  }

  async function saveEdit() {
    if (!editTitle.trim() || !editDate) return;
    setSaving(true);
    const supabase = createClient();

    const patch: Record<string, unknown> = {
      title: editTitle.trim(),
      meeting_time: editMeeting || null,
      location: editLocation.trim() || null,
      opponent: isMatch && editOpponent.trim() ? editOpponent.trim() : null,
    };

    if (scope === "all" && event.recurrence_group_id) {
      const deltaMs = new Date(editDate).getTime() - new Date(event.event_date).getTime();
      if (deltaMs !== 0) {
        const { data: groupRows } = await supabase
          .from("events")
          .select("id, event_date")
          .eq("recurrence_group_id", event.recurrence_group_id)
          .eq("team_id", event.team_id);
        if (groupRows) {
          for (const row of groupRows) {
            const shifted = new Date(new Date(row.event_date).getTime() + deltaMs).toISOString();
            const { error } = await supabase
              .from("events")
              .update({ ...patch, event_date: shifted })
              .eq("id", row.id)
              .eq("team_id", event.team_id);
            if (error) {
              toast.error(`Erreur lors de la modification : ${error.message}`);
              setSaving(false);
              return;
            }
          }
        }
      } else {
        const { error } = await supabase
          .from("events")
          .update(patch)
          .eq("recurrence_group_id", event.recurrence_group_id)
          .eq("team_id", event.team_id);
        if (error) {
          toast.error(`Erreur lors de la modification : ${error.message}`);
          setSaving(false);
          return;
        }
      }
    } else {
      patch.event_date = new Date(editDate).toISOString();
      const { error } = await supabase
        .from("events")
        .update(patch)
        .eq("id", event.id)
        .eq("team_id", event.team_id);
      if (error) {
        toast.error(`Erreur lors de la modification : ${error.message}`);
        setSaving(false);
        return;
      }
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
    toast.success(
      scope === "all"
        ? `Toutes les occurrences modifiées (${groupCount})`
        : "Événement modifié"
    );
    clearQueryCache();
  }

  async function saveCancel() {
    setSaving(true);
    const supabase = createClient();
    const nextStatus = event.status === "cancelled" ? "upcoming" : "cancelled";

    const q = supabase
      .from("events")
      .update({ status: nextStatus })
      .eq("team_id", event.team_id)
      .select("id, event_date");
    if (scope === "all" && event.recurrence_group_id) {
      q.eq("recurrence_group_id", event.recurrence_group_id);
    } else {
      q.eq("id", event.id);
    }
    const { data: rows, error } = await q;

    if (error) {
      toast.error(`Erreur : ${error.message}`);
      setSaving(false);
      return;
    }

    onSaved({ ...event, status: nextStatus });
    setSaving(false);
    setCancelOpen(false);
    if (nextStatus === "cancelled") {
      toast.success(
        scope === "all" ? `Toutes les occurrences annulées (${groupCount})` : "Événement annulé"
      );
      for (const row of rows || []) {
        await notifyPlayers(
          row.id,
          event.team_id,
          isMatch,
          `Événement annulé : ${event.title}`,
          `L'événement du ${formatEventDate(row.event_date)} est annulé.`,
          "event_cancelled"
        );
      }
    } else {
      toast.success(
        scope === "all" ? `Toutes les occurrences réactivées (${groupCount})` : "Événement réactivé"
      );
    }
    clearQueryCache();
  }

  const isCancelled = event.status === "cancelled";

  async function saveDelete() {
    setSaving(true);
    const supabase = createClient();

    const q = supabase
      .from("events")
      .delete()
      .eq("team_id", event.team_id);
    if (scope === "all" && event.recurrence_group_id) {
      q.eq("recurrence_group_id", event.recurrence_group_id);
    } else {
      q.eq("id", event.id);
    }
    const { error } = await q;

    setSaving(false);
    setDeleteOpen(false);

    if (error) {
      toast.error(`Erreur lors de la suppression : ${error.message}`);
      return;
    }

    toast.success(
      scope === "all" ? `Toutes les occurrences supprimées (${groupCount})` : "Événement supprimé"
    );
    clearQueryCache();
    router.push("/calendar");
  }

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
        onClick={() => { setScope("single"); setCancelOpen(true); }}
      >
        {isCancelled ? (
          <><RotateCcw className="h-3.5 w-3.5 mr-1" />Réactiver</>
        ) : (
          <><XCircle className="h-3.5 w-3.5 mr-1" />Annuler</>
        )}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
        onClick={() => { setScope("single"); setDeleteOpen(true); }}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        Supprimer
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
            <ScopeToggle scope={scope} onChange={setScope} groupCount={groupCount} show={hasRecurrences} />
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
              {hasRecurrences && scope === "all" && (
                <p className="text-xs text-muted-foreground">
                  Le décalage est appliqué à toutes les occurrences (la première prend cette date).
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Heure de RDV</Label>
              <Input type="time" value={editMeeting} onChange={(e) => setEditMeeting(e.target.value)} />
            </div>
            <div className="space-y-2">
              <LocationPicker
                teamId={event.team_id}
                value={editLocation}
                onChange={setEditLocation}
                isCoach
              />
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
          <div className="space-y-3">
            <ScopeToggle scope={scope} onChange={setScope} groupCount={groupCount} show={hasRecurrences} />
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Supprimer */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer l&apos;événement</DialogTitle>
            <DialogDescription>
              L&apos;événement et toutes ses données (présences, stats, feuille de match...) seront définitivement supprimés. Aucune notification ne sera envoyée aux joueurs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ScopeToggle scope={scope} onChange={setScope} groupCount={groupCount} show={hasRecurrences} />
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="ghost" className="flex-1" onClick={() => setDeleteOpen(false)}>
                Retour
              </Button>
              <Button
                type="button"
                className="flex-1 bg-red-600 text-white hover:bg-red-700 font-semibold"
                disabled={saving}
                onClick={saveDelete}
              >
                {saving ? "..." : "Supprimer définitivement"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
