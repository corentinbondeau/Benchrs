"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from "lucide-react";
import type { Event } from "@/types";

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

export default function CalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "training" as "match" | "training",
    event_date: "",
    location: "",
    opponent: "",
  });

  const isCoach = user?.profile?.role === "coach";

  function fetchEvents() {
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: true })
      .then(({ data }) => {
        setEvents((data as Event[]) || []);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchEvents();
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  function getDaysInMonth(y: number, m: number) {
    return new Date(y, m + 1, 0).getDate();
  }

  function getFirstDayOfMonth(y: number, m: number) {
    const day = new Date(y, m, 1).getDay();
    return day === 0 ? 6 : day - 1; // Monday-based
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
      const eventDate = new Date(e.event_date);
      return eventDate.toISOString().slice(0, 10) === dateStr;
    });
  }

  function getEventsForWeek() {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return events.filter((e) => {
      const d = new Date(e.event_date);
      return d >= weekStart && d <= end;
    });
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    await supabase.from("events").insert({
      title: form.title,
      type: form.type,
      event_date: form.event_date,
      location: form.location || null,
      opponent: form.type === "match" ? form.opponent || null : null,
      status: "upcoming",
      created_by: user?.id,
    });
    setCreateOpen(false);
    setForm({ title: "", type: "training", event_date: "", location: "", opponent: "" });
    fetchEvents();
  }

  function getEventBadgeColor(event: Event) {
    if (event.type === "match") {
      if (event.match_result === "win") return "bg-green-100 text-green-700 border-green-200";
      if (event.match_result === "loss") return "bg-red-100 text-red-700 border-red-200";
      if (event.match_result === "draw") return "bg-amber-100 text-amber-700 border-amber-200";
      return "bg-blue-100 text-blue-700 border-blue-200";
    }
    return "bg-purple-100 text-purple-700 border-purple-200";
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
          <p className="text-muted-foreground mt-1">Planning de l&apos;equipe</p>
        </div>
        {isCoach && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
              <Plus className="h-4 w-4 mr-1" />
              Evenement
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouvel evenement</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div className="space-y-2">
                  <Label>Titre *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Entrainement" required />
                </div>
                <div className="space-y-2">
                  <Label>Type *</Label>
                  <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v as "match" | "training" })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="training">Entrainement</SelectItem>
                      <SelectItem value="match">Match</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date et heure *</Label>
                  <Input type="datetime-local" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Lieu</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Stade, terrain..." />
                </div>
                {form.type === "match" && (
                  <div className="space-y-2">
                    <Label>Adversaire</Label>
                    <Input value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} placeholder="Nom de l'equipe adverse" />
                  </div>
                )}
                <Button type="submit" className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">
                  Creer
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
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;

              return (
                <div key={day} className={`h-24 border-b border-r p-1 overflow-hidden ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
                  <p className={`text-xs font-medium mb-1 ${isToday ? "text-[var(--color-royal)] font-bold" : ""}`}>
                    {day}
                  </p>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div key={event.id} className={`text-[10px] truncate rounded px-1 py-0.5 border ${getEventBadgeColor(event)}`}>
                        {event.title}
                      </div>
                    ))}
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
            const dateStr = day.toISOString().slice(0, 10);
            const dayEvents = getEventsForDate(dateStr);
            const isToday = new Date().toISOString().slice(0, 10) === dateStr;

            return (
              <div key={i} className={`rounded-lg border p-3 ${isToday ? "bg-blue-50 dark:bg-blue-950/20 border-[var(--color-royal)]" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-sm font-medium ${isToday ? "text-[var(--color-royal)]" : ""}`}>
                    {DAYS_FR[i]} {day.getDate()} {MONTHS_FR[day.getMonth()]}
                  </p>
                </div>
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aucun evenement</p>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map((event) => (
                      <div key={event.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className={getEventBadgeColor(event)}>
                          {event.type === "match" ? "Match" : "Entrainement"}
                        </Badge>
                        <span className="font-medium">{event.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.event_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {event.location && (
                          <span className="text-xs text-muted-foreground">- {event.location}</span>
                        )}
                        {event.score_us !== null && event.score_them !== null && (
                          <span className="text-xs font-bold">{event.score_us}-{event.score_them}</span>
                        )}
                      </div>
                    ))}
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
