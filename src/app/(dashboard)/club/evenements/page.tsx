"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarHeart, Plus, Pencil, Trash2, Ticket, Euro, CheckCheck, Undo2, MapPin, Clock } from "lucide-react";
import { toast } from "sonner";

interface ClubEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  start_time: string | null;
  location: string | null;
  price: number;
  capacity: number;
  status: "announced" | "open" | "closed" | "cancelled";
  created_at: string;
}
interface Attendee {
  id: string;
  event_id: string;
  user_id: string;
  places: number;
  note: string | null;
  checked_in: boolean;
  created_at: string;
}

const STATUS_LABEL: Record<ClubEvent["status"], string> = {
  announced: "Annoncé",
  open: "Inscriptions ouvertes",
  closed: "Clôturé",
  cancelled: "Annulé",
};

export default function ClubEvenementsPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClubEvent | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [price, setPrice] = useState("0");
  const [capacity, setCapacity] = useState("0");

  const load = useCallback(
    async (cid: string) => {
      const { data: eventsData } = await supabaseRef.current
        .from("club_special_events")
        .select("*")
        .eq("club_id", cid)
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      const eventRows = ((eventsData || []) as Record<string, unknown>[]).map((e) => ({
        id: e.id as string,
        title: e.title as string,
        description: (e.description as string | null) ?? null,
        event_date: (e.event_date as string | null) ?? null,
        start_time: (e.start_time as string | null) ?? null,
        location: (e.location as string | null) ?? null,
        price: Number(e.price) || 0,
        capacity: (e.capacity as number) ?? 0,
        status: (e.status as ClubEvent["status"]) ?? "announced",
        created_at: e.created_at as string,
      }));

      let attendeeRows: Attendee[] = [];
      let namesMap: Record<string, string> = {};
      if (eventRows.length > 0) {
        const ids = eventRows.map((e) => e.id);
        const { data: attData } = await supabaseRef.current
          .from("club_event_attendees")
          .select("*")
          .in("event_id", ids);
        attendeeRows = ((attData || []) as Record<string, unknown>[]).map((a) => ({
          id: a.id as string,
          event_id: a.event_id as string,
          user_id: a.user_id as string,
          places: (a.places as number) ?? 1,
          note: (a.note as string | null) ?? null,
          checked_in: (a.checked_in as boolean) ?? false,
          created_at: a.created_at as string,
        }));
        const userIds = [...new Set(attendeeRows.map((a) => a.user_id))];
        if (userIds.length > 0) {
          const { data: profiles } = await supabaseRef.current
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", userIds);
          namesMap = Object.fromEntries(
            ((profiles || []) as { id: string; first_name: string | null; last_name: string | null }[]).map(
              (p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Membre"]
            )
          );
        }
      }
      return { events: eventRows, attendees: attendeeRows, names: namesMap };
    },
    []
  );

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setEvents(res.events);
      setAttendees(res.attendees);
      setNames(res.names);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  function refresh() {
    if (clubId) {
      load(clubId).then((res) => {
        setEvents(res.events);
        setAttendees(res.attendees);
        setNames(res.names);
      });
    }
  }

  async function saveEvent() {
    if (!clubId || !user || !title.trim()) {
      toast.error("Titre requis");
      return;
    }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: eventDate || null,
      start_time: startTime || null,
      location: location.trim() || null,
      price: Math.max(0, Number(price) || 0),
      capacity: Math.max(0, Number(capacity) || 0),
    };
    const res = editing
      ? await supabaseRef.current
          .from("club_special_events")
          .update(payload)
          .eq("id", editing.id)
          .eq("club_id", clubId)
      : await supabaseRef.current
          .from("club_special_events")
          .insert({ ...payload, club_id: clubId, created_by: user.id });
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(editing ? "Événement mis à jour" : "Événement créé");
    setDialogOpen(false);
    setEditing(null);
    setTitle("");
    setDescription("");
    setEventDate("");
    setStartTime("");
    setLocation("");
    setPrice("0");
    setCapacity("0");
    refresh();
  }

  async function setStatus(ev: ClubEvent, status: ClubEvent["status"]) {
    const { error } = await supabaseRef.current
      .from("club_special_events")
      .update({ status })
      .eq("id", ev.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function deleteEvent(ev: ClubEvent) {
    if (!confirm(`Supprimer l'événement « ${ev.title} » ?`)) return;
    const { error } = await supabaseRef.current
      .from("club_special_events")
      .delete()
      .eq("id", ev.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function upsertAttendance(eventId: string, places: number, note: string) {
    if (!user) return;
    const payload = { event_id: eventId, user_id: user.id, places, note: note.trim() || null };
    const existing = attendees.find((a) => a.event_id === eventId && a.user_id === user.id);
    const { error } = existing
      ? await supabaseRef.current
          .from("club_event_attendees")
          .update(payload)
          .eq("id", existing.id)
          .eq("user_id", user.id)
      : await supabaseRef.current.from("club_event_attendees").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(existing ? "Réservation mise à jour" : "Réservation enregistrée");
    refresh();
  }

  async function removeAttendance(eventId: string) {
    if (!user) return;
    const existing = attendees.find((a) => a.event_id === eventId && a.user_id === user.id);
    if (!existing) return;
    const { error } = await supabaseRef.current
      .from("club_event_attendees")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Inscription annulée");
    refresh();
  }

  async function toggleCheckin(att: Attendee) {
    const { error } = await supabaseRef.current
      .from("club_event_attendees")
      .update({ checked_in: !att.checked_in, checked_in_at: !att.checked_in ? new Date().toISOString() : null })
      .eq("id", att.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  function openCreate() {
    setEditing(null);
    setTitle("");
    setDescription("");
    setEventDate("");
    setStartTime("");
    setLocation("");
    setPrice("0");
    setCapacity("0");
    setDialogOpen(true);
  }
  function openEdit(ev: ClubEvent) {
    setEditing(ev);
    setTitle(ev.title);
    setDescription(ev.description ?? "");
    setEventDate(ev.event_date ?? "");
    setStartTime(ev.start_time ?? "");
    setLocation(ev.location ?? "");
    setPrice(String(ev.price));
    setCapacity(String(ev.capacity));
    setDialogOpen(true);
  }

  function eventAttendees(eventId: string) {
    return attendees
      .filter((a) => a.event_id === eventId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  return (
    <ClubPageShell
      title="Événementiel spécial"
      subtitle="Tournoi de printemps, gala, match de gala : inscriptions et émargement"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || (clubId ? pageLoading : false)}
      actions={
        isCommittee ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouvel événement
          </Button>
        ) : undefined
      }
    >
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarHeart className="h-4 w-4 text-[var(--color-royal)]" />
              {editing ? "Modifier l'événement" : "Nouvel événement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Titre</Label>
              <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Tournoi de printemps U8-U13" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-desc">Description (optionnel)</Label>
              <Input id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Programme, âges concernés…" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-date">Date</Label>
                <Input id="ev-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-time">Heure</Label>
                <Input id="ev-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-location">Lieu</Label>
              <Input id="ev-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. : Stade municipal" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-price">Prix par place (€)</Label>
                <Input id="ev-price" type="number" min={0} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-capacity">Capacité (0 = illimité)</Label>
                <Input id="ev-capacity" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={saveEvent} disabled={!title.trim()}>
                {editing ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {events.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucun événement pour le moment.
            </CardContent>
          </Card>
        )}
        {events.map((ev) => {
          const atts = eventAttendees(ev.id);
          const totalPlaces = atts.reduce((acc, a) => acc + a.places, 0);
          const revenue = totalPlaces * ev.price;
          const mine = atts.find((a) => a.user_id === user?.id) ?? null;
          const full = ev.capacity > 0 && totalPlaces >= ev.capacity;
          const canRegister = ev.status === "open" && !full && !isCommittee;
          return (
            <Card key={ev.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{ev.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant={ev.status === "open" ? "default" : ev.status === "cancelled" ? "outline" : "secondary"}>
                        {STATUS_LABEL[ev.status]}
                      </Badge>
                      {ev.event_date && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(ev.event_date + "T00:00:00").toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}
                          {ev.start_time ? ` · ${ev.start_time.slice(0, 5)}` : ""}
                        </span>
                      )}
                      {ev.location && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {ev.location}
                        </span>
                      )}
                      {ev.price > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Euro className="h-3 w-3" />
                          {ev.price} € / place
                        </span>
                      )}
                    </div>
                    {ev.description && <p className="text-sm text-muted-foreground mt-1">{ev.description}</p>}
                  </div>
                  {isCommittee && (
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {ev.status !== "open" && (
                        <Button variant="outline" size="sm" onClick={() => setStatus(ev, "open")}>
                          Ouvrir les inscriptions
                        </Button>
                      )}
                      {ev.status === "open" && (
                        <Button variant="outline" size="sm" onClick={() => setStatus(ev, "closed")}>
                          Clôturer
                        </Button>
                      )}
                      {ev.status === "announced" && (
                        <Button variant="ghost" size="sm" onClick={() => setStatus(ev, "cancelled")}>
                          Annuler
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ev)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteEvent(ev)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">
                    <Ticket className="h-3 w-3 mr-1" />
                    {totalPlaces} place{totalPlaces > 1 ? "s" : ""}
                    {ev.capacity > 0 ? ` / ${ev.capacity}` : ""}
                  </Badge>
                  {isCommittee && ev.price > 0 && (
                    <Badge variant="outline">
                      <Euro className="h-3 w-3 mr-1" />
                      {revenue.toFixed(2).replace(".", ",")} €
                    </Badge>
                  )}
                  {full && (
                    <Badge variant="destructive">
                      <Clock className="h-3 w-3 mr-1" />
                      Complet
                    </Badge>
                  )}
                </div>

                {canRegister && (
                  <RegistrationForm
                    key={`${ev.id}-${mine?.id ?? "new"}`}
                    initial={mine}
                    price={ev.price}
                    onSave={(places, note) => upsertAttendance(ev.id, places, note)}
                    onRemove={() => removeAttendance(ev.id)}
                  />
                )}

                {atts.length > 0 && (
                  <div className="rounded-lg border divide-y">
                    {atts.map((a) => (
                      <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium flex items-center gap-2">
                            {names[a.user_id] ?? "Membre"}
                            {a.user_id === user?.id && !isCommittee && <Badge variant="secondary">Moi</Badge>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {a.places} place{a.places > 1 ? "s" : ""}
                            {a.note ? ` · ${a.note}` : ""}
                            {a.user_id !== user?.id && isCommittee && !a.checked_in && " · à l'émargement"}
                          </p>
                        </div>
                        {isCommittee && (
                          <Button
                            variant={a.checked_in ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => toggleCheckin(a)}
                          >
                            {a.checked_in ? <CheckCheck className="h-3 w-3 mr-1" /> : <Undo2 className="h-3 w-3 mr-1" />}
                            {a.checked_in ? "Pointé" : "Pointer"}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ClubPageShell>
  );
}

function RegistrationForm({
  initial,
  price,
  onSave,
  onRemove,
}: {
  initial: { id: string; places: number; note: string | null } | null;
  price: number;
  onSave: (places: number, note: string) => void;
  onRemove: () => void;
}) {
  const [places, setPlaces] = useState(initial?.places ?? 1);
  const [note, setNote] = useState(initial?.note ?? "");
  const saved = !!initial;
  return (
    <div className="rounded-lg border border-[var(--color-royal)]/30 bg-[var(--color-royal)]/5 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Nombre de places</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={places}
            onChange={(e) => setPlaces(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-24 h-9"
          />
        </div>
        <div className="space-y-1 flex-1 min-w-40">
          <Label className="text-xs">Note (optionnel)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : 2 adultes + 2 enfants" className="h-9" />
        </div>
        <Button size="sm" onClick={() => onSave(places, note)}>
          {saved ? "Mettre à jour" : price > 0 ? `Réserver (${(places * price).toFixed(2).replace(".", ",")} €)` : "Réserver"}
        </Button>
        {saved && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}