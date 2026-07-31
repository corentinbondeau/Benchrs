"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell } from "lucide-react";
import { toast } from "sonner";
import { ConvocationsDialog } from "@/components/ConvocationsDialog";
import {
  AttendanceLists,
  EventInfoCard,
  getParentChildId,
  type MyPresenceInfo,
  type PlayerAttendanceRow,
} from "@/components/EventDetail";
import { fetchTeamActivePlayers } from "@/lib/players";
import type { AttendanceStatus, Event } from "@/types";

type TrainingEvent = Event & { meeting_time: string | null };

export default function TrainingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const trainingId = params.id as string;

  const [event, setEvent] = useState<TrainingEvent | null>(null);
  const [players, setPlayers] = useState<PlayerAttendanceRow[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [convDialogOpen, setConvDialogOpen] = useState(false);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    const team = currentTeam;

    async function fetchData() {
      const [eventRes, attRes, allPlayers] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .eq("id", trainingId)
          .eq("team_id", team.id)
          .single(),
        supabase
          .from("attendances")
          .select("id, user_id, status, absence_reason")
          .eq("event_id", trainingId)
          .eq("team_id", team.id),
        fetchTeamActivePlayers(team.id),
      ]);

      setEvent(eventRes.data as TrainingEvent | null);

      const atts = (attRes.data || []) as { id: string; user_id: string; status: string; absence_reason: string | null }[];

      const merged: PlayerAttendanceRow[] = allPlayers.map((p) => {
        const att = atts.find((a) => a.user_id === p.id);
        return {
          profile: p,
          status: att ? (att.status as AttendanceStatus) : null,
          attendanceId: att ? att.id : null,
          absenceReason: att?.absence_reason ?? null,
        };
      });

      setPlayers(merged);
      setLoading(false);
    }

    fetchData();

    if (!isCoach && user?.id) {
      if (userRole === "parent") {
        getParentChildId(user.id, team.id).then(setChildId);
      }
    }
  }, [trainingId, currentTeam, isCoach, user?.id, userRole]);

  async function updateAttendance(userId: string, status: AttendanceStatus, reason?: string) {
    const supabase = createClient();
    const existing = players.find((p) => p.profile.id === userId);

    if (existing?.attendanceId) {
      await supabase
        .from("attendances")
        .update({
          status,
          responded_at: new Date().toISOString(),
          absence_reason: reason || null,
        })
        .eq("id", existing.attendanceId);
    } else {
      await supabase.from("attendances").insert({
        event_id: trainingId,
        user_id: userId,
        team_id: currentTeam!.id,
        status,
        responded_at: new Date().toISOString(),
        absence_reason: reason || null,
      });
    }

    setPlayers((prev) =>
      prev.map((p) =>
        p.profile.id === userId
          ? { ...p, status, attendanceId: p.attendanceId || "new", absenceReason: reason || null }
          : p
      )
    );

    toast.success(
      status === "present"
        ? "Présence enregistrée"
        : status === "late"
          ? "Retard enregistré"
          : status === "excused"
            ? "Excuse enregistrée"
            : "Absence enregistrée"
    );
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          Entraînement introuvable
        </div>
      </div>
    );
  }

  const eventDate = new Date(event.event_date);

  let myPresence: MyPresenceInfo | undefined;
  if (!isCoach && user?.id) {
    if (userRole === "player") {
      const me = players.find((p) => p.profile.id === user.id);
      if (me) {
        myPresence = {
          label: "Ma présence",
          playerId: me.profile.id,
          status: me.status,
        };
      }
    } else if (userRole === "parent" && childId) {
      const child = players.find((p) => p.profile.id === childId);
      if (child) {
        myPresence = {
          label: `Présence de ${child.profile.first_name}`,
          playerId: child.profile.id,
          status: child.status,
        };
      }
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retour
      </Button>

      {/* Header */}
      <Card className="bg-gradient-to-r from-[var(--color-navy)] to-[var(--color-royal)] text-white">
        <CardContent className="p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white border-white/30">
                Entraînement
              </Badge>
              {event.status === "cancelled" && (
                <Badge className="bg-red-500/80 text-white border-red-400/30">
                  Annulé
                </Badge>
              )}
            </div>
            <h2 className="text-2xl font-bold">{event.title}</h2>
          </div>
          {isCoach && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
                onClick={() => setConvDialogOpen(true)}
              >
                <Bell className="h-3.5 w-3.5 mr-1" />
                Convoquer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Partie 1 — Informations globales */}
      <EventInfoCard
        date={eventDate}
        meetingTime={event.meeting_time}
        location={event.location}
        myPresence={myPresence}
        onRespond={myPresence ? (status, reason) => updateAttendance(myPresence.playerId, status, reason) : undefined}
      />

      {/* Partie 2 — Liste des présents et absents */}
      <AttendanceLists
        players={players}
        isCoach={isCoach}
        onUpdate={updateAttendance}
      />

      <ConvocationsDialog
        event={event}
        open={convDialogOpen}
        onOpenChange={setConvDialogOpen}
      />
    </div>
  );
}
