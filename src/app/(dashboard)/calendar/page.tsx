"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useAllChildren } from "@/lib/useSelectedChild";
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
  MapPin,
  Users,
  Bell,
  HeartPulse,
  Trophy,
  Dumbbell,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ContentSkeleton } from "@/components/ui/content-skeleton";
import { toast } from "sonner";
import { ConvocationsDialog } from "@/components/ConvocationsDialog";
import { LocationPicker } from "@/components/calendar/LocationPicker";
import { fetchTeamActivePlayers } from "@/lib/players";
import { clearQueryCache } from "@/lib/queryCache";
import type { Event, Profile } from "@/types";

type Recurrence = "Aucun" | "weekly" | "biweekly" | "monthly";

type EventWithMeeting = Event & { meeting_time: string | null };

interface CalendarInjury {
  id: string;
  team_id: string;
  player_id: string;
  injury_date: string;
  expected_return: string | null;
  player: { first_name: string; last_name: string }[] | null;
}

const DAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function computeRecurrenceDates(eventDate: Date, recurrence: Recurrence, endDate: string): Date[] {
  const dates: Date[] = [new Date(eventDate)];
  if (recurrence === "Aucun") return dates;
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

function toUTCISOString(date: Date): string {
  return date.toISOString();
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Pré-remplissage de la fin par défaut : +2h pour un match, +1h30 pour un
// entraînement (mêmes durées codées en dur dans l'export ICS).
function computeDefaultEndDate(eventDateLocal: string, type: "match" | "training"): string {
  if (!eventDateLocal) return "";
  const start = new Date(eventDateLocal);
  if (Number.isNaN(start.getTime())) return "";
  const durationMs = type === "match" ? 2 * 60 * 60 * 1000 : 90 * 60 * 1000;
  return toDatetimeLocalValue(new Date(start.getTime() + durationMs));
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { currentTeam, userRole, switchTeam } = useTeam();
  const { children: allChildren } = useAllChildren();
  const router = useRouter();
  const [view, setView] = useState<"month" | "week" | "list">("list");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<EventWithMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, { present: number; total: number }>>({});
  const [convDialogEvent, setConvDialogEvent] = useState<Event | null>(null);
  const [cycles, setCycles] = useState<{ id: string; name: string; cycle_type: string }[]>([]);
  const [showAllChildren, setShowAllChildren] = useState(false);
  const [teamMeta, setTeamMeta] = useState<Record<string, { teamName: string; childNames: string[] }>>({});
  const [eventInjuries, setEventInjuries] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState({
    title: "",
    type: "training" as "match" | "training",
    event_date: "",
    end_date: "",
    recurrence_until: "",
    meeting_time: "",
    location: "",
    opponent: "",
    recurrence: "Aucun" as Recurrence,
    convocation_lead_days: "3",
    selected_player_ids: [] as string[],
    cycle_id: "",
  });

  const isCoach = userRole === "coach" || userRole === "owner";

  // Équipes des enfants (toutes équipes confondues) pour l'agenda fusionné
  const childTeamIds = useMemo(
    () =>
      [...new Set((allChildren || []).flatMap((c) => c.team_ids))].filter(Boolean),
    [allChildren]
  );

  useEffect(() => {
    if (!user?.id || childTeamIds.length === 0) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("teams")
      .select("id, name")
      .in("id", childTeamIds)
      .then(({ data }) => {
        if (cancelled) return;
        const names = (data || []) as { id: string; name: string }[];
        const meta: Record<string, { teamName: string; childNames: string[] }> = {};
        for (const tid of childTeamIds) {
          const t = names.find((n) => n.id === tid);
          if (!t) continue;
          meta[tid] = {
            teamName: t.name,
            childNames: (allChildren || [])
              .filter((c) => c.team_ids.includes(tid))
              .map((c) => c.first_name),
          };
        }
        setTeamMeta(meta);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, childTeamIds, allChildren]);

  function fetchEvents(teamIds: string[]) {
    const supabase = createClient();
    const ids = teamIds.length > 0 ? teamIds : [currentTeam!.id];
    Promise.all([
      supabase
        .from("events")
        .select("id, title, event_date, end_date, type, status, location, opponent, score_us, score_them, match_result, team_id, meeting_time")
        .in("team_id", ids)
        .order("event_date", { ascending: true }),
      supabase
        .from("attendances")
        .select("event_id, status")
        .in("team_id", ids),
      supabase
        .from("injuries")
        .select("id, team_id, player_id, injury_date, expected_return, player:profiles!injuries_player_id_fkey(first_name, last_name)")
        .eq("status", "active")
        .in("team_id", ids),
    ]).then(([eventsRes, attRes, injRes]) => {
      const seen = new Set<string>();
      const eventsList = ((eventsRes.data as EventWithMeeting[]) || []).filter(
        (e) => (seen.has(e.id) ? false : (seen.add(e.id), true))
      );
      setEvents(eventsList);
      setLoading(false);

      const activeInj = ((injRes.data || []) as CalendarInjury[]).filter(
        (i) =>
          !i.expected_return || new Date(i.expected_return) >= new Date(i.injury_date)
      );
      const injMap: Record<string, string[]> = {};
      for (const event of eventsList) {
        const evDate = new Date(event.event_date);
        const evStart = new Date(evDate);
        evStart.setHours(0, 0, 0, 0);
        const evEnd = new Date(evDate);
        evEnd.setHours(23, 59, 59, 999);
        for (const inj of activeInj) {
          if (inj.team_id !== event.team_id) continue;
          const start = new Date(inj.injury_date);
          const end = inj.expected_return ? new Date(inj.expected_return) : null;
          const inWindow = evStart <= (end || evEnd) && evEnd >= start;
          if (!inWindow) continue;
          const p = inj.player?.[0];
          const name = p ? `${p.first_name} ${p.last_name}` : "";
          if (!injMap[event.id]) injMap[event.id] = [];
          if (!injMap[event.id].includes(name)) injMap[event.id].push(name);
        }
      }
      setEventInjuries(injMap);

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

  useEffect(() => {
    if (!currentTeam) return;
    const ids =
      showAllChildren && childTeamIds.length > 0
        ? childTeamIds
        : [currentTeam.id];
    fetchEvents(ids);
    fetchTeamActivePlayers(currentTeam.id).then((data) => setPlayers(data));
    createClient()
      .from("season_cycles")
      .select("id, name, cycle_type")
      .eq("team_id", currentTeam!.id)
      .order("start_date", { ascending: true })
      .then(({ data }) => setCycles((data as { id: string; name: string; cycle_type: string }[]) || []));
  }, [currentTeam, showAllChildren, childTeamIds]);

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

  function handleCreateOpenChange(open: boolean) {
    if (open && players.length > 0) {
      setForm((prev) => ({ ...prev, selected_player_ids: players.map((p) => p.id) }));
    }
    setCreateOpen(open);
  }

  function selectAllPlayers() {
    setForm((prev) => ({ ...prev, selected_player_ids: players.map((p) => p.id) }));
  }

  function clearAllPlayers() {
    setForm((prev) => ({ ...prev, selected_player_ids: [] }));
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const eventDate = new Date(form.event_date);

    if (form.end_date && new Date(form.end_date).getTime() <= eventDate.getTime()) {
      toast.error("L'heure de fin doit être postérieure à l'heure de début.");
      return;
    }

    const dates = computeRecurrenceDates(eventDate, form.recurrence, form.recurrence_until);

    const recurrenceGroupId = dates.length > 1 ? crypto.randomUUID() : null;

    // Chaque occurrence conserve la même durée que la première.
    const endDate = form.end_date ? new Date(form.end_date) : null;
    const durationMs = endDate ? endDate.getTime() - eventDate.getTime() : null;

    const rows = dates.map((d) => ({
      title: form.title,
      type: form.type,
      event_date: toUTCISOString(d),
      end_date: durationMs !== null ? toUTCISOString(new Date(d.getTime() + durationMs)) : null,
      meeting_time: form.meeting_time || null,
      location: form.location || null,
      opponent: form.type === "match" ? form.opponent || null : null,
      status: "upcoming" as const,
      created_by: user?.id,
      team_id: currentTeam!.id,
      convocation_lead_days: parseInt(form.convocation_lead_days, 10) || 3,
      recurrence_group_id: recurrenceGroupId,
      cycle_id: form.cycle_id || null,
    }));

    const { data: inserted, error } = await supabase.from("events").insert(rows).select("id, event_date");

    if (error) {
      toast.error(`Erreur lors de la création : ${error.message}`);
      return;
    }

    if (inserted) {
      const convokeIds = form.selected_player_ids;
      if (convokeIds.length > 0) {
        const leadDays = parseInt(form.convocation_lead_days, 10) || 3;
        const type = form.type;
        const title = form.title;
        scheduleConvocations(inserted, convokeIds, leadDays, type, title);
      }
    }

    setCreateOpen(false);
    setForm({
      title: "",
      type: "training",
      event_date: "",
      end_date: "",
      recurrence_until: "",
      meeting_time: "",
      location: "",
      opponent: "",
      recurrence: "Aucun",
      convocation_lead_days: "3",
      selected_player_ids: [],
      cycle_id: "",
    });
    fetchEvents(
      showAllChildren && childTeamIds.length > 0
        ? childTeamIds
        : [currentTeam!.id]
    );
    clearQueryCache();

    if (dates.length === 1) {
      toast.success("Événement créé !");
    } else {
      toast.success(`${dates.length} événements créés !`);
    }
  }

  function scheduleConvocations(
    events: { id: string; event_date: string }[],
    userIds: string[],
    leadDays: number,
    type: "match" | "training",
    title: string
  ) {
    const supabase = createClient();
    for (const evt of events) {
      const evtDate = new Date(evt.event_date);
      const scheduledFor = new Date(evtDate.getTime() - leadDays * 24 * 60 * 60 * 1000);
      const evtUrl = type === "match"
        ? `/matches/${evt.id}`
        : `/trainings/${evt.id}`;
      // Convocation programmée leadDays avant l'événement
      // (envoyée immédiatement par la route si la date est déjà passée)
      authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: userIds,
          title: `Convocation : ${title}`,
          body: `Vous êtes convoqué(e) le ${evtDate.toLocaleDateString("fr-FR")}`,
          type: "convocation",
          reference_id: evt.id,
          team_id: currentTeam!.id,
          url: evtUrl,
          scheduled_for: scheduledFor.toISOString(),
        }),
      }).then(() => {
        // Marquer convocations_sent_at uniquement lors du premier envoi
        supabase
          .from("events")
          .update({ convocations_sent_at: new Date().toISOString() })
          .eq("id", evt.id)
          .is("convocations_sent_at", null)
          .then(() => {});
      }).catch(() => {
        // La création de l'événement ne doit pas dépendre de l'envoi des convocations
      });
    }
  }

  function teamLabel(event: EventWithMeeting): string {
    if (!showAllChildren) return "";
    const m = teamMeta[event.team_id];
    if (!m) return "";
    return m.childNames.length > 0
      ? `${m.teamName} · ${m.childNames.join(" & ")}`
      : m.teamName;
  }

  function selectEvent(event: EventWithMeeting) {
    if (showAllChildren && currentTeam && event.team_id !== currentTeam.id) {
      switchTeam(event.team_id);
    }
    if (event.type === "match") {
      router.push(`/matches/${event.id}`);
    } else {
      router.push(`/trainings/${event.id}`);
    }
  }

  function getEventBadgeColor(event: Event) {
    if (event.status === "cancelled") return "bg-gray-100 dark:bg-gray-800/40 text-gray-500 border-gray-200 dark:border-gray-700 line-through";
    if (event.type === "match") {
      if (event.match_result === "win") return "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800";
      if (event.match_result === "loss") return "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";
      if (event.match_result === "draw") return "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800";
      return "bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    }
    // Training — neutral/secondary to contrast with match blue
    return "bg-secondary text-secondary-foreground border-border";
  }

  function getEventIcon(event: Event) {
    if (event.type === "match") return Trophy;
    return Dumbbell;
  }

  function getEventBorderColor(event: Event) {
    if (event.status === "cancelled") return "border-l-gray-400";
    if (event.type === "match") {
      if (event.match_result === "win") return "border-l-[var(--color-success)]";
      if (event.match_result === "loss") return "border-l-[var(--color-danger)]";
      if (event.match_result === "draw") return "border-l-[var(--color-warning)]";
      return "border-l-[var(--color-primary-blue)]";
    }
    return "border-l-[var(--color-muted-foreground)]";
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
    const end = event.end_date ? formatTimeDisplay(event.end_date) : null;
    const range = end ? `${start} - ${end}` : start;
    return (
      <span className="text-xs text-muted-foreground">
        {rdv ? `RDV: ${rdv} | Début: ${range}` : range}
      </span>
    );
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l&apos;équipe...</p></div>;
  }

  if (loading) {
    return (
      <div className="section-gap">
        <h1 className="text-2xl font-bold">Calendrier</h1>
        <div className="h-96 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <Suspense fallback={<ContentSkeleton />}>
    <div className="section-gap">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Calendrier</h1>
          <p className="text-sm text-muted-foreground mt-1">Planning de l&apos;équipe</p>
        </div>
        {isCoach && (
          <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
            <DialogTrigger render={<Button className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" />}>
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
                  <Select
                    value={form.type}
                    onValueChange={(v) => {
                      if (!v) return;
                      const type = v as "match" | "training";
                      setForm((prev) => ({
                        ...prev,
                        type,
                        end_date: computeDefaultEndDate(prev.event_date, type) || prev.end_date,
                      }));
                    }}
                  >
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
                  <Input
                    type="datetime-local"
                    value={form.event_date}
                    onChange={(e) => {
                      const event_date = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        event_date,
                        end_date: computeDefaultEndDate(event_date, prev.type),
                      }));
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Heure de fin</Label>
                  <Input
                    type="datetime-local"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Heure de RDV</Label>
                  <Input type="time" value={form.meeting_time} onChange={(e) => setForm({ ...form, meeting_time: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <LocationPicker
                    teamId={currentTeam!.id}
                    value={form.location}
                    onChange={(v) => setForm({ ...form, location: v })}
                    isCoach={isCoach}
                  />
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
                      <SelectItem value="Aucun">Aucune</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                      <SelectItem value="biweekly">Bimensuel</SelectItem>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.recurrence !== "Aucun" && (
                  <div className="space-y-2">
                    <Label>Date de fin *</Label>
                    <Input type="date" value={form.recurrence_until} onChange={(e) => setForm({ ...form, recurrence_until: e.target.value })} required />
                  </div>
                )}
                {cycles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Cycle de saison</Label>
                    <Select
                      value={form.cycle_id}
                      onValueChange={(v) => v && setForm({ ...form, cycle_id: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Aucun cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Aucun cycle</SelectItem>
                        {cycles.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {players.length > 0 && (
                  <div className="space-y-2">
                    <Label>Convocations</Label>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {form.selected_player_ids.length} joueur{form.selected_player_ids.length > 1 ? "s" : ""} convoqué{form.selected_player_ids.length > 1 ? "s" : ""}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectAllPlayers}>
                          Tout
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAllPlayers}>
                          Aucun
                        </Button>
                      </div>
                    </div>
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
                  </div>
                )}
                {form.selected_player_ids.length > 0 && (
                  <div className="space-y-2">
                    <Label>Convocations automatiques</Label>
                    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Jours avant l&apos;événement</span>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={30}
                        className="w-20 h-8"
                        value={form.convocation_lead_days}
                        onChange={(e) => setForm({ ...form, convocation_lead_days: e.target.value })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Les joueurs convoqués recevront la convocation {parseInt(form.convocation_lead_days, 10) || 3} jour{parseInt(form.convocation_lead_days, 10) || 3 > 1 ? "s" : ""} avant l&apos;événement.
                    </p>
                  </div>
                )}
                <Button type="submit" className="w-full bg-[var(--color-primary-blue)] text-white font-semibold">
                  Créer
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <Button variant="outline" size="icon" className="h-11 w-11 md:h-8 md:w-8" onClick={handlePrev}>
            <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11 md:h-8 md:w-8" onClick={handleNext}>
            <ChevronRight className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {userRole === "parent" && childTeamIds.length > 1 && (
            <div className="flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAllChildren(false)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  !showAllChildren
                    ? "bg-[var(--color-navy)] text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Mon équipe
              </button>
              <button
                type="button"
                onClick={() => setShowAllChildren(true)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  showAllChildren
                    ? "bg-[var(--color-navy)] text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                Mes {childTeamIds.length} équipes
              </button>
            </div>
          )}
          <div className="flex rounded-lg border overflow-hidden">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" className="rounded-none" onClick={() => setView("list")}>
              Liste
            </Button>
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
                          {(() => { const Icon = getEventIcon(event); return <Icon className="h-2.5 w-2.5 shrink-0" />; })()}
                          <span className="truncate">{event.title}</span>
                          {showAllChildren && (
                            <span className="shrink-0 text-[9px] font-semibold uppercase">{(teamMeta[event.team_id]?.teamName || "").slice(0, 3)}</span>
                          )}
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

      {/* List View */}
      {view === "list" && (() => {
        const now = new Date();
        const sortedEvents = [...events]
          .filter((e) => new Date(e.event_date) >= now)
          .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

        if (sortedEvents.length === 0) {
          return (
            <EmptyState
              icon={CalendarDays}
              title="Aucun événement à venir"
              description="Les prochains matchs et entraînements apparaîtront ici."
            />
          );
        }

        return (
          <div className="space-y-2">
            {sortedEvents.map((event) => {
              const attCount = attendanceCounts[event.id];
              return (
                <div key={event.id} className={`rounded-lg border border-l-[3px] ${getEventBorderColor(event)} p-4 flex items-start gap-3 cursor-pointer hover:bg-muted/50 transition-colors`} onClick={() => selectEvent(event)}>
                  <div className="flex flex-col items-center min-w-[48px]">
                    <span className="text-xs text-muted-foreground uppercase">
                      {new Date(event.event_date).toLocaleDateString("fr-FR", { month: "short" })}
                    </span>
                    <span className="text-xl font-bold leading-tight">
                      {new Date(event.event_date).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`${getEventBadgeColor(event)} flex items-center gap-1`}>
                        {(() => { const Icon = getEventIcon(event); return <Icon className="h-3 w-3" />; })()}
                        {event.type === "match" ? "Match" : "Entrainement"}
                      </Badge>
                      {event.status === "cancelled" && (
                        <Badge variant="destructive" className="text-[10px]">Annule</Badge>
                      )}
                    </div>
                    <p className="font-semibold text-sm mt-1 truncate">{event.title}</p>
                    {showAllChildren && (
                      <p className="text-xs text-[var(--color-royal)] font-medium mt-0.5">
                        {teamLabel(event)}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      <EventTimeDisplay event={event} />
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{event.location}
                        </span>
                      )}
                      {event.opponent && (
                        <span>vs {event.opponent}</span>
                      )}
                      {event.score_us !== null && event.score_them !== null && (
                        <span className="font-bold">{event.score_us}-{event.score_them}</span>
                      )}
                      {eventInjuries[event.id]?.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-medium">
                          <HeartPulse className="h-3 w-3" />
                          {eventInjuries[event.id].join(", ")} — blessé{eventInjuries[event.id].length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {attCount && attCount.total > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground mr-1">
                        <Users className="h-3 w-3" />
                        {attCount.present}/{attCount.total}
                      </span>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setConvDialogEvent(event); }}>
                      <Bell className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Week View */}
      {view === "week" && (() => {
        const weekDays = Array.from({ length: 7 }).map((_, i) => {
          const day = new Date(weekStart);
          day.setDate(day.getDate() + i);
          const dateStr = toLocalDateStr(day);
          return { day, dateStr, dayEvents: getEventsForDate(dateStr), isToday: toLocalDateStr(new Date()) === dateStr };
        });
        const hasEvents = weekDays.some((d) => d.dayEvents.length > 0);

        return (
          <div className="space-y-2">
            {hasEvents ? weekDays.map(({ day, dateStr, dayEvents, isToday }, i) => {
              if (dayEvents.length === 0) return null;
              return (
                <div key={i} className={`rounded-lg border p-3 ${isToday ? "bg-blue-50 dark:bg-blue-950/20 border-[var(--color-royal)]" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={`text-sm font-medium ${isToday ? "text-[var(--color-royal)]" : ""}`}>
                      {DAYS_FR[i]} {day.getDate()} {MONTHS_FR[day.getMonth()]}
                    </p>
                  </div>
                  <div className="space-y-1">
                      {dayEvents.map((event) => {
                        const attCount = attendanceCounts[event.id];
                        return (
                          <div
                            key={event.id}
                            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm group relative cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1.5 -mx-2 transition-colors border-l-[3px] ${getEventBorderColor(event)} pl-3`}
                            onClick={() => selectEvent(event)}
                          >
                            <Badge variant="outline" className={`${getEventBadgeColor(event)} flex items-center gap-1`}>
                              {(() => { const Icon = getEventIcon(event); return <Icon className="h-3 w-3" />; })()}
                              {event.type === "match" ? "Match" : "Entrainement"}
                            </Badge>
                            <span className="font-medium min-w-0 break-words">{event.title}</span>
                            {showAllChildren && (
                              <span className="text-[11px] text-[var(--color-royal)] font-medium">{teamLabel(event)}</span>
                            )}
                            <EventTimeDisplay event={event} />
                            {event.location && (
                              <span className="text-xs text-muted-foreground min-w-0 break-words">- {event.location}</span>
                            )}
                            {event.score_us !== null && event.score_them !== null && (
                              <span className="text-xs font-bold">{event.score_us}-{event.score_them}</span>
                            )}
                            {eventInjuries[event.id]?.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 font-medium">
                                <HeartPulse className="h-3 w-3" />
                                {eventInjuries[event.id].join(", ")}
                              </span>
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
                </div>
              );
            }) : (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">Pas d&apos;évènements prévus cette semaine !</p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Convocations Dialog */}
      {convDialogEvent && (
        <ConvocationsDialog
          event={convDialogEvent}
          open
          onOpenChange={(open) => { if (!open) setConvDialogEvent(null); }}
        />
      )}
    </div>
    </Suspense>
  );
}
