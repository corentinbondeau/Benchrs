"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  MapPin,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { Event, Profile } from "@/types";

type Recurrence = "none" | "weekly" | "biweekly" | "monthly";

type EventWithMeeting = Event & { meeting_time: string | null };

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function computeRecurrenceDates(eventDate: Date, recurrence: Recurrence, endDate: string): Date[] {
  const dates: Date[] = [new Date(eventDate)];
  if (recurrence === "none") return dates;
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  let current = new Date(eventDate);
  while (true) {
    if (recurrence === "weekly") current.setDate(current.getDate() + 7);
    else if (recurrence === "biweekly") current.setDate(current.getDate() + 14);
    else if (recurrence === "monthly") current.setMonth(current.getMonth() + 1);
    if (current > end) break;
    dates.push(new Date(current));
  }
  return dates;
}

function toLocalISOString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}:00`;
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<"month" | "week">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<EventWithMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, { present: number; total: number }>>({});
  const [form, setForm] = useState({
    title: "",
    type: "training" as "match" | "training",
    event_date: "",
    end_date: "",
    meeting_time: "",
    location: "",
    opponent: "",
    recurrence: "none" as Recurrence,
    selected_player_ids: [] as string[],
  });

  const isCoach = user?.profile?.role === "coach";

  function fetchEvents() {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true }),
      supabase
        .from("attendances")
        .select("event_id, status"),
    ]).then(([eventsRes, attRes]) => {
      const eventsList = (eventsRes.data as EventWithMeeting[]) || [];
      setEvents(eventsList);
      setLoading(false);

      if (attRes.data) {
        const eventIds = new Set(eventsList.map((e) => e.id));
        const counts: Record<string, { present: number; total: number }> = {};
        for (const att of attRes.data) {
          if (!eventIds.has(att.event_id)) continue;
          if (!counts[att.event_id]) {
            counts[att.event_id] = { present: 0, total: 0 };
          }
          counts[att.event_id].total++;
          if (att.status === "present" || att.status === "late") {
            counts[att.event_id].present++;
          }
        }
        setAttendanceCounts(counts);
      }
    });
  }

  function fetchPlayers() {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "player")
      .eq("is_active", true)
      .order("last_name", { ascending: true })
      .then(({ data }) => {
        setPlayers((data as Profile[]) || []);
      });
  }

  useEffect(() => {
    fetchEvents();
    fetchPlayers();
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  function getDaysInMonth(y: number, m: number) {
    return new Date(y, m + 1, 0).getDate();
  }

  function getFirstDayOfMonth(y: number, m: number) {
    const day = new Date(y, m, 1).getDay();
    return day === 0 ? 6 : day - 1;
  }

  function getWeekStart(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const weekStart = getWeekStart(currentDate);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const title =
    view === "month"
      ? `${MONTHS_FR[month]} ${year}`
      : `Semaine du ${weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;

  function handlePrev() {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  }

  function handleNext() {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  function getEventsForDate(dateStr: string) {
    return events.filter((e) => {
      const d = new Date(e.event_date);
      return toLocalDateStr(d) === dateStr;
    });
  }

  function togglePlayer(playerId: string) {
    setForm((prev) => {
      const ids = prev.selected_player_ids.includes(playerId)
        ? prev.selected_player_ids.filter((id) => id !== playerId)
        : [...prev.selected_player_ids, playerId];
      return { ...prev, selected_player_ids: ids };
    });
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const eventDate = new Date(form.event_date);
    const dates = computeRecurrenceDates(eventDate, form.recurrence, form.end_date);

    const rows = dates.map((d) => ({
      title: form.title,
      type: form.type,
      event_date: toLocalISOString(d),
      meeting_time: form.meeting_time || null,
      location: form.location || null,
      opponent: form.type === "match" ? form.opponent || null : null,
      status: "upcoming" as const,
      created_by: user?.id,
    }));

    const { data: inserted, error } = await supabase.from("events").insert(rows).select("id");

    if (error) {
      toast.error("Erreur lors de la création");
      return;
    }

    if (inserted && form.type === "match" && form.selected_player_ids.length > 0) {
      const attendanceRows = inserted.flatMap((evt) =>
        form.selected_player_ids.map((pid) => ({
          event_id: evt.id,
          user_id: pid,
          status: "pending" as const,
        }))
      );
      await supabase.from("attendances").insert(attendanceRows);
    }

    setCreateOpen(false);
    setForm({
      title: "",
      type: "training",
      event_date: "",
      end_date: "",
      meeting_time: "",
      location: "",
      opponent: "",
      recurrence: "none",
      selected_player_ids: [],
    });
    fetchEvents();

    if (dates.length === 1) {
      toast.success("Événement créé !");
    } else {
      toast.success(`${dates.length} événements créés !`);
    }
  }

  function selectEvent(event: EventWithMeeting) {
    if (event.type === "match") {
      router.push(`/matches/${event.id}`);
    } else {
      router.push(`/trainings/${event.id}`);
    }
  }

  function getEventBadgeColor(event: Event) {
    if (event.type === "match") {
      if (event.match_result === "win") return "bg-green-100 text-green-700 border-green-200";
      if (event.match_result === "loss") return "bg-red-100 text-red-700 border-red-200";
      if (event.match_result === "draw") return "bg-amber-100 text-amber-700 border-amber-200";
      return "bg-blue-100 text-blue-700 border-blue-200";
    }
    if (event.status === "cancelled") return "bg-gray-100 text-gray-500 border-gray-200 line-through";
    return "bg-blue-100 text-blue-700 border-blue-200";
  }

  function formatTimeDisplay(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function EventTimeDisplay({ event }: { event: EventWithMeeting }) {
    const start = formatTimeDisplay(event.event_date);
    const rdv = event.meeting_time;
    return (
      <span className="text-xs text-muted-foreground">
        {rdv ? `RDV: ${rdv} | Début: ${start}` : start}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Calendrier</h2>
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Calendrier</h2>
          <p className="text-muted-foreground mt-1">Planning de l&apos;équipe</p>
        </div>
        {isCoach && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
              <Plus className="h-4 w-4 mr-1" />
              Événement
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvel événement</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div className="space-y-2">
                  <Label>Titre *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Entraînement" required />
                </div>
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v as "match" | "training" })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="training">Entraînement</SelectItem>
                      <SelectItem value="match">Match</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date et heure *</Label>
                  <Input type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Heure de RDV</Label>
                  <Input type="time" value={form.meeting_time} onChange={(e) => setForm({ ...form, meeting_time: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Lieu</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Stade, terrain..." />
                </div>
                {form.type === "match" && (
                  <div className="space-y-2">
                    <Label>Adversaire</Label>
                    <Input value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} placeholder="Nom de l'équipe adverse" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Récurrence</Label>
                  <Select value={form.recurrence} onValueChange={(v) => v && setForm({ ...form, recurrence: v as Recurrence })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucune</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                      <SelectItem value="biweekly">Bimensuel</SelectItem>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.recurrence !== "none" && (
                  <div className="space-y-2">
                    <Label>Date de fin *</Label>
                    <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
                  </div>
                )}
                {form.type === "match" && players.length > 0 && (
                  <div className="space-y-2">
                    <Label>Convocations</Label>
                    <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                      {players.map((player) => (
                        <label key={player.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300"
                            checked={form.selected_player_ids.includes(player.id)}
                            onChange={() => togglePlayer(player.id)}
                          />
                          <span className="text-sm">
                            {player.first_name} {player.last_name}
                            {player.shirt_number ? ` (#${player.shirt_number})` : ""}
                          </span>
                        </label>
                      ))}
                    </div>
                    {form.selected_player_ids.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {form.selected_player_ids.length} joueur{form.selected_player_ids.length > 1 ? "s" : ""} convoque{form.selected_player_ids.length > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                )}
                <Button type="submit" className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">
                  Créer
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <Button variant={view === "month" ? "secondary" : "ghost"} size="sm" className="rounded-none" onClick={() => setView("month")}>
              Mois
            </Button>
            <Button variant={view === "week" ? "secondary" : "ghost"} size="sm" className="rounded-none" onClick={() => setView("week")}>
              Semaine
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={handleToday}>
            <CalendarDays className="h-3.5 w-3.5 mr-1" />
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Month View */}
      {view === "month" && (
        <div className="rounded-lg border">
          <div className="grid grid-cols-7">
            {DAYS_FR.map((day) => (
              <div key={day} className="p-2 text-center text-xs font-medium text-muted-foreground border-b">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-24 border-b border-r p-1 bg-muted/30" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayEvents = getEventsForDate(dateStr);
              const isToday = toLocalDateStr(new Date()) === dateStr;

              return (
                <div key={day} className={`h-24 border-b border-r p-1 overflow-hidden ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
                  <p className={`text-xs font-medium mb-1 ${isToday ? "text-[var(--color-royal)] font-bold" : ""}`}>
                    {day}
                  </p>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => {
                      const attCount = attendanceCounts[event.id];
                      return (
                        <div
                          key={event.id}
                          className={`text-[10px] truncate rounded px-1 py-0.5 border cursor-pointer hover:opacity-80 flex items-center gap-1 ${getEventBadgeColor(event)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectEvent(event);
                          }}
                        >
                          <span className="truncate">{event.title}</span>
                          {attCount && attCount.total > 0 && (
                            <span className="shrink-0 flex items-center gap-0.5">
                              <Users className="h-2.5 w-2.5" />
                              {attCount.present}/{attCount.total}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 2}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week View */}
      {view === "week" && (
        <div className="space-y-2">
          {Array.from({ length: 7 }).map((_, i) => {
            const day = new Date(weekStart);
            day.setDate(day.getDate() + i);
            const dateStr = toLocalDateStr(day);
            const dayEvents = getEventsForDate(dateStr);
            const isToday = toLocalDateStr(new Date()) === dateStr;

            return (
              <div key={i} className={`rounded-lg border p-3 ${isToday ? "bg-blue-50 dark:bg-blue-950/20 border-[var(--color-royal)]" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-sm font-medium ${isToday ? "text-[var(--color-royal)]" : ""}`}>
                    {DAYS_FR[i]} {day.getDate()} {MONTHS_FR[day.getMonth()]}
                  </p>
                </div>
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun événement</p>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map((event) => {
                      const attCount = attendanceCounts[event.id];
                      return (
                        <div
                          key={event.id}
                          className="flex items-center gap-2 text-sm group relative cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1 -mx-2 transition-colors"
                          onClick={() => selectEvent(event)}
                        >
                          <Badge variant="outline" className={getEventBadgeColor(event)}>
                            {event.type === "match" ? "Match" : "Entraînement"}
                          </Badge>
                          <span className="font-medium">{event.title}</span>
                          <EventTimeDisplay event={event} />
                          {event.location && (
                            <span className="text-xs text-muted-foreground">- {event.location}</span>
                          )}
                          {event.score_us !== null && event.score_them !== null && (
                            <span className="text-xs font-bold">{event.score_us}-{event.score_them}</span>
                          )}
                          {attCount && attCount.total > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {attCount.present}/{attCount.total}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
