"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Clock, Bell } from "lucide-react";
import { toast } from "sonner";
import type { Attendance, Event, Profile } from "@/types";

interface CoachPendingItem {
  attendance: Attendance;
  event: Event;
  player: Profile;
}

export function PendingConvocations() {
  const { user } = useAuth();
  const router = useRouter();
  const isCoach = user?.profile?.role === "coach";

  const [playerAttendances, setPlayerAttendances] = useState<(Attendance & { event: Event })[]>([]);
  const [coachItems, setCoachItems] = useState<CoachPendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [absenceReason, setAbsenceReason] = useState("");
  const [pendingAbsentId, setPendingAbsentId] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();

    if (isCoach) {
      Promise.all([
        supabase
          .from("attendances")
          .select("*, event:events!attendances_event_id_fkey(*)")
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("*")
          .eq("role", "player")
          .eq("is_active", true),
      ]).then(([attRes, playersRes]) => {
        const atts = (attRes.data as (Attendance & { event: Event })[]) || [];
        const allPlayers = (playersRes.data as Profile[]) || [];
        const items: CoachPendingItem[] = atts
          .map((att) => {
            const player = allPlayers.find((p) => p.id === att.user_id);
            if (!player || !att.event) return null;
            return { attendance: att, event: att.event, player };
          })
          .filter(Boolean) as CoachPendingItem[];
        setCoachItems(items);
        setLoading(false);
      });
    } else {
      supabase
        .from("attendances")
        .select("*, event:events!attendances_event_id_fkey(*)")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setPlayerAttendances((data as (Attendance & { event: Event })[]) || []);
          setLoading(false);
        });
    }
  }, [user?.id, isCoach]);

  async function respond(attendanceId: string, status: "present" | "absent" | "late", reason?: string) {
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

    setPlayerAttendances((prev) => prev.filter((a) => a.id !== attendanceId));
    setPendingAbsentId(null);
    setAbsenceReason("");
  }

  async function sendReminder(item: CoachPendingItem) {
    setRemindingId(item.attendance.id);

    const res = await fetch("/api/notifications/reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: item.player.id,
        eventTitle: item.event.title,
        eventDate: item.event.event_date,
      }),
    });

    setRemindingId(null);

    if (!res.ok) {
      toast.error("Erreur lors de l'envoi de l'email");
      return;
    }

    toast.success(`Email de relance envoyé à ${item.player.first_name} ${item.player.last_name}`);
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
                    <Badge variant="secondary" className="text-xs">
                      {items.length} en attente
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div key={item.attendance.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5">
                        <span className="text-sm">
                          {item.player.first_name} {item.player.last_name}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          disabled={remindingId === item.attendance.id}
                          onClick={() => sendReminder(item)}
                        >
                          <Bell className="h-3 w-3" />
                          {remindingId === item.attendance.id ? "..." : "Relancer"}
                        </Button>
                      </div>
                    ))}
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
            {playerAttendances.map((att) => (
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
                      <Button size="icon" variant="outline" className="h-8 w-8 text-green-600 hover:bg-green-50" onClick={() => respond(att.id, "present")}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-amber-600 hover:bg-amber-50" onClick={() => respond(att.id, "late")}>
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-red-600 hover:bg-red-50" onClick={() => respond(att.id, "absent")}>
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
                      <Button size="sm" className="h-7 text-xs" disabled={!absenceReason.trim()} onClick={() => respond(att.id, "absent", absenceReason.trim())}>
                        Confirmer
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setPendingAbsentId(null); setAbsenceReason(""); }}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
