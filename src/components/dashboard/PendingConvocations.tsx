"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useRouter } from "next/navigation";
import { useQueryCache, clearQueryCache } from "@/lib/queryCache";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Clock, Bell } from "lucide-react";
import { toast } from "sonner";
import { isEventLocked, CONVOCATION_LOCKED_MESSAGE } from "@/lib/event-lock";
import { groupRemindersByEvent, countPendingPlayers } from "@/lib/convocation-reminders";
import { RemindAllButton } from "@/components/RemindAllButton";
import type { Attendance, Event, Profile } from "@/types";

interface CoachPendingItem {
  attendance: Attendance;
  event: Event;
  player: Profile;
  parents: Profile[];
}

type PendingData =
  | { role: "coach"; items: CoachPendingItem[] }
  | { role: "player"; items: (Attendance & { event: Event })[] };

export function PendingConvocations() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const router = useRouter();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [absenceReason, setAbsenceReason] = useState("");
  const [pendingAbsentId, setPendingAbsentId] = useState<string | null>(null);
  const [remindingKey, setRemindingKey] = useState<string | null>(null);

  const key = currentTeam && user?.id
    ? `convocations:pending:${currentTeam.id}:${isCoach ? "coach" : user.id}`
    : null;

  const { data, loading, revalidate } = useQueryCache<PendingData>(
    key,
    async () => {
      const supabase = createClient();
      if (isCoach) {
        const [attRes, playersRes, psRes] = await Promise.all([
          supabase
            .from("attendances")
            .select("*, event:events!attendances_event_id_fkey(*)")
            .eq("team_id", currentTeam!.id)
            .eq("status", "pending")
            .order("created_at", { ascending: false }),
          supabase
            .from("profiles")
            .select("*")
            .eq("role", "player")
            .eq("is_active", true),
          supabase
            .from("parent_student")
            .select("parent_id, student_id")
            .eq("team_id", currentTeam!.id),
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const rawAtts = (attRes.data as (Attendance & { event: Event })[]) || [];
        const atts = rawAtts.filter((att) => {
          const ev = att.event;
          if (!ev) return false;
          return new Date(ev.event_date) >= today;
        });
        const allPlayers = (playersRes.data as Profile[]) || [];
        const links = (psRes.data as { parent_id: string; student_id: string }[]) || [];

        const parentIds = [...new Set(links.map((l) => l.parent_id))];
        const { data: parentData } = await supabase
          .from("profiles")
          .select("*")
          .in("id", parentIds.length > 0 ? parentIds : ["00000000-0000-0000-0000-000000000000"]);
        const allParents = (parentData as Profile[]) || [];

        const items: CoachPendingItem[] = atts
          .map((att) => {
            const player = allPlayers.find((p) => p.id === att.user_id);
            if (!player || !att.event) return null;
            const parentIdsForPlayer = links
              .filter((l) => l.student_id === att.user_id)
              .map((l) => l.parent_id);
            const parents = allParents.filter((p) => parentIdsForPlayer.includes(p.id));
            return { attendance: att, event: att.event, player, parents };
          })
          .filter(Boolean) as CoachPendingItem[];

        return { role: "coach", items } as PendingData;
      }

      const { data: attData } = await supabase
        .from("attendances")
        .select("*, event:events!attendances_event_id_fkey(*)")
        .eq("user_id", user!.id)
        .eq("team_id", currentTeam!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      const todayPlayer = new Date();
      todayPlayer.setHours(0, 0, 0, 0);
      const futureAtts = ((attData as (Attendance & { event: Event })[]) || []).filter((att) => {
        const ev = att.event;
        if (!ev) return false;
        return new Date(ev.event_date) >= todayPlayer;
      });
      return { role: "player", items: futureAtts } as PendingData;
    },
    { ttl: 15_000 }
  );

  const coachItems = data?.role === "coach" ? data.items : [];
  const playerAttendances = data?.role === "player" ? data.items : [];

  if (!currentTeam) return null;

  async function respond(
    attendanceId: string,
    status: "present" | "absent" | "late",
    reason?: string,
    eventDate?: string | null,
    endDate?: string | null
  ) {
    if (isEventLocked(eventDate, endDate)) {
      toast.error(CONVOCATION_LOCKED_MESSAGE);
      return;
    }
    if (status === "absent" && !reason) {
      setPendingAbsentId(attendanceId);
      return;
    }

    const supabase = createClient();
    await supabase
      .from("attendances")
      .update({
        status,
        responded_at: new Date().toISOString(),
        absence_reason: status === "absent" ? reason || null : null,
      })
      .eq("id", attendanceId);

    clearQueryCache();
    revalidate();
    setPendingAbsentId(null);
    setAbsenceReason("");
  }

  async function sendReminder(item: CoachPendingItem, target: "player" | "parent", parentProfile?: Profile) {
    if (isEventLocked(item.event.event_date, item.event.end_date)) {
      toast.error(CONVOCATION_LOCKED_MESSAGE);
      return;
    }
    const key = `${item.attendance.id}-${target}`;
    setRemindingKey(key);

    const targetUser = target === "parent" && parentProfile ? parentProfile : item.player;
    const dateStr = new Date(item.event.event_date).toLocaleDateString("fr-FR");
    const res = await authFetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: [targetUser.id],
        title: `Relance : ${item.event.title}`,
        body: `Vous n'avez pas encore répondu à la convocation du ${dateStr}`,
        type: "rappel",
        reference_id: item.event.id,
        team_id: currentTeam!.id,
        url: item.event.type === "match"
          ? `/matches/${item.event.id}`
          : `/trainings/${item.event.id}`,
      }),
    });

    setRemindingKey(null);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Erreur lors de l'envoi de la notification");
      return;
    }

    toast.success(`Notification de relance envoyée à ${targetUser.first_name}`);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // Coach view
  if (isCoach) {
    const groupedByEvent = new Map<string, { event: Event; items: CoachPendingItem[] }>();
    for (const item of coachItems) {
      const existing = groupedByEvent.get(item.event.id);
      if (existing) {
        existing.items.push(item);
      } else {
        groupedByEvent.set(item.event.id, { event: item.event, items: [item] });
      }
    }

    const reminderEvents = Array.from(groupedByEvent.values()).map(({ event }) => ({
      id: event.id,
      title: event.title,
      type: event.type,
      event_date: event.event_date,
      end_date: event.end_date,
    }));
    const reminderAttendances = coachItems.map((item) => ({
      event_id: item.event.id,
      user_id: item.player.id,
      status: item.attendance.status,
    }));
    const parentLinksForReminders = coachItems.flatMap((item) =>
      item.parents.map((parent) => ({ parent_id: parent.id, student_id: item.player.id }))
    );
    const reminderTargets = groupRemindersByEvent({
      events: reminderEvents,
      attendances: reminderAttendances,
      parentLinks: parentLinksForReminders,
    });
    const pendingPlayerCount = countPendingPlayers(reminderTargets, reminderAttendances);

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Convocations en attente
            {coachItems.length > 0 && (
              <Badge className="bg-[var(--color-gold)] text-[var(--color-navy)]">
                {coachItems.length}
              </Badge>
            )}
            <div className="ml-auto">
              {currentTeam && (
                <RemindAllButton
                  targets={reminderTargets}
                  pendingCount={pendingPlayerCount}
                  teamId={currentTeam.id}
                  onDone={revalidate}
                />
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {coachItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Toutes les convocations ont reçu une réponse
            </p>
          ) : (
            <div className="space-y-4">
              {Array.from(groupedByEvent.entries()).map(([eventId, { event, items }]) => (
                <div key={eventId} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p
                        className="font-medium text-sm cursor-pointer hover:underline"
                        onClick={() => router.push(event.type === "match" ? `/matches/${event.id}` : `/trainings/${event.id}`)}
                      >
                        {event.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.event_date).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {items.length} en attente
                      </Badge>
                      {currentTeam && (
                        <RemindAllButton
                          targets={reminderTargets.filter((t) => t.event.id === eventId)}
                          pendingCount={countPendingPlayers(
                            reminderTargets.filter((t) => t.event.id === eventId),
                            reminderAttendances
                          )}
                          teamId={currentTeam.id}
                          onDone={revalidate}
                          compact
                        />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => {
                      const locked = isEventLocked(item.event.event_date, item.event.end_date);
                      return (
                      <div key={item.attendance.id} className="rounded-md bg-muted/50 px-3 py-1.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">
                            {item.player.first_name} {item.player.last_name}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={remindingKey === `${item.attendance.id}-player` || locked}
                            onClick={() => sendReminder(item, "player")}
                          >
                            <Bell className="h-3 w-3" />
                            {remindingKey === `${item.attendance.id}-player` ? "..." : "Relancer"}
                          </Button>
                        </div>
                        {item.parents.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.parents.map((parent) => (
                              <Button
                                key={parent.id}
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1 text-muted-foreground"
                                disabled={remindingKey === `${item.attendance.id}-parent` || locked}
                                onClick={() => sendReminder(item, "parent", parent)}
                              >
                                <Bell className="h-2.5 w-2.5" />
                                {remindingKey === `${item.attendance.id}-parent`
                                  ? "..."
                                  : `Relancer ${parent.first_name}`}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Player view
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          Convocations en attente
          {playerAttendances.length > 0 && (
            <Badge className="bg-[var(--color-gold)] text-[var(--color-navy)]">
              {playerAttendances.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {playerAttendances.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune convocation en attente
          </p>
        ) : (
          <div className="space-y-3">
            {playerAttendances.map((att) => {
              const locked = isEventLocked(att.event?.event_date, att.event?.end_date);
              return (
              <div key={att.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p
                      className="font-medium text-sm cursor-pointer hover:underline"
                      onClick={() => router.push(att.event?.type === "match" ? `/matches/${att.event?.id}` : `/trainings/${att.event?.id}`)}
                    >
                      {att.event?.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(att.event?.event_date).toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                  </div>
                  {pendingAbsentId !== att.id && (
                    <div className="flex gap-1.5">
                      <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => respond(att.id, "present", undefined, att.event?.event_date, att.event?.end_date)} disabled={locked}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => respond(att.id, "late", undefined, att.event?.event_date, att.event?.end_date)} disabled={locked}>
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => respond(att.id, "absent", undefined, att.event?.event_date, att.event?.end_date)} disabled={locked}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {pendingAbsentId === att.id && (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs">Motif d&apos;absence (obligatoire)</Label>
                    <Input
                      placeholder="Ex: Blessure, travail..."
                      value={absenceReason}
                      onChange={(e) => setAbsenceReason(e.target.value)}
                      className="text-sm h-8"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" disabled={!absenceReason.trim()} onClick={() => respond(att.id, "absent", absenceReason.trim(), att.event?.event_date, att.event?.end_date)}>
                        Confirmer
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setPendingAbsentId(null); setAbsenceReason(""); }}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
