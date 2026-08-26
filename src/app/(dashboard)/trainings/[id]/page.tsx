"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Bell, PenLine, Car, Heart, Users } from "lucide-react";
import { toast } from "sonner";
import { ConvocationsDialog } from "@/components/ConvocationsDialog";
import { AnnouncementDialog } from "@/components/announcements/AnnouncementDialog";
import { DepartureNotifier } from "@/components/event/DepartureNotifier";
import { EventCoachActions } from "@/components/EventCoachActions";
import { SessionFiche } from "@/components/training/SessionFiche";
import { SessionFormCheckIn } from "@/components/training/SessionFormCheckIn";
import { SessionRpe } from "@/components/training/SessionRpe";
import { WeatherWidget } from "@/components/event/WeatherWidget";
import { TerrainImpraticable } from "@/components/event/TerrainImpraticable";
import { LockerPlaylist } from "@/components/event/LockerPlaylist";
import { SessionFeedback } from "@/components/training/SessionFeedback";
import {
  AttendanceLists,
  EventInfoCard,
  type MyPresenceInfo,
  type PlayerAttendanceRow,
} from "@/components/EventDetail";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { useSelectedChild } from "@/lib/useSelectedChild";
import { fetchTeamActivePlayers } from "@/lib/players";
import { computeMissingResponders } from "@/lib/session-reminders";
import { SessionRemindersCard } from "@/components/training/SessionRemindersCard";
import { logActivity } from "@/lib/activity";
import { isEventLocked, CONVOCATION_LOCKED_MESSAGE } from "@/lib/event-lock";
import type { AttendanceStatus, Event } from "@/types";

type TrainingEvent = Event & {
  meeting_time: string | null;
  convocations_sent_at?: string | null;
};

export default function TrainingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const trainingId = params.id as string;

  const [event, setEvent] = useState<TrainingEvent | null>(null);
  const [players, setPlayers] = useState<PlayerAttendanceRow[]>([]);
  const [missingResponderCount, setMissingResponderCount] = useState(0);
  const { children: myChildren, selectedChildId: childId, setChild: setChildId } = useSelectedChild(currentTeam?.id);
  const [loading, setLoading] = useState(true);
  const [convDialogOpen, setConvDialogOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    const team = currentTeam;

    async function fetchData() {
      const [eventRes, attRes, allPlayers, rpeRes, feedbackRes] = await Promise.all([
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
        supabase.from("session_rpe").select("player_id, rpe").eq("event_id", trainingId),
        supabase.from("session_feedback").select("player_id, rating").eq("event_id", trainingId),
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

      const missing = computeMissingResponders({
        attendances: atts.map((a) => ({ user_id: a.user_id, status: a.status })),
        rpeRows: (rpeRes.data || []) as { player_id: string; rpe: number | null }[],
        feedbackRows: (feedbackRes.data || []) as { player_id: string; rating: number | null }[],
        activePlayerIds: allPlayers.map((p) => p.id),
      });
      setMissingResponderCount(missing.length);

      setLoading(false);
    }

    fetchData();
  }, [trainingId, currentTeam, isCoach, user?.id, userRole]);

  async function updateAttendance(userId: string, status: AttendanceStatus, reason?: string) {
    if (isEventLocked(event?.event_date)) {
      toast.error(CONVOCATION_LOCKED_MESSAGE);
      return;
    }
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

    const playerName = players.find((p) => p.profile.id === userId)?.profile.first_name || "Un joueur";
    const statusLabel =
      status === "present" ? "présent" : status === "late" ? "en retard" : status === "excused" ? "excusé" : "absent";
    await logActivity({
      teamId: currentTeam!.id,
      clubId: currentTeam!.club_id,
      userId: user?.id,
      actionType: "attendance.update",
      description: `${playerName} marqué ${statusLabel} à l'entraînement`,
      metadata: { eventId: trainingId, userId, status },
    });
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
    <div className="section-gap">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retour
      </Button>

      {/* Header */}
      <div className="rounded-xl bg-[var(--color-navy)] text-white p-5 md:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/[0.12] text-white border-white/20">
                Entrainement
              </Badge>
              {event.status === "cancelled" && (
                <Badge className="bg-red-500/80 text-white border-red-400/30">
                  Annule
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold">{event.title}</h1>
          </div>
          {isCoach && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
                onClick={() => setConvDialogOpen(true)}
              >
                <Bell className="h-3.5 w-3.5 mr-1" />
                Convoquer
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-white/40 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setAnnouncementOpen(true)}
              >
                <PenLine className="h-3.5 w-3.5 mr-1" />
                Annonce IA
              </Button>
              <EventCoachActions
                event={event}
                isMatch={false}
                onSaved={(updated) => setEvent(updated)}
              />
              <TerrainImpraticable
                event={event}
                teamId={currentTeam.id}
                isCoach={isCoach}
                url={`/trainings/${trainingId}`}
              />
            </div>
          )}
      </div>

      <DepartureNotifier
        eventId={trainingId}
        teamId={currentTeam.id}
        isCoach={isCoach}
        location={event.location}
        url={`/trainings/${trainingId}`}
        departureAt={event.departure_notified_at ?? null}
        arrivalAt={event.arrival_notified_at ?? null}
        onSent={(kind, at) =>
          setEvent((prev) =>
            prev
              ? kind === "depart"
                ? { ...prev, departure_notified_at: at }
                : { ...prev, arrival_notified_at: at }
              : prev
          )
        }
      />

      {/* Fiche de séance */}
      <SessionFiche eventId={trainingId} isCoach={isCoach} eventDate={event.event_date} eventTitle={event.title} />

      {/* Commutateur d'enfant (parents multi-enfants) */}
      {userRole === "parent" && (
        <ChildSwitcher
          kids={myChildren}
          selectedChildId={childId}
          onSelect={setChildId}
        />
      )}

      {/* Raccourcis contextuels */}
      {isCoach && event.status !== "completed" && (
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/carpooling"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Car className="h-4 w-4 text-muted-foreground shrink-0" />
            Covoiturage
          </Link>
          <Link
            href="/attendance"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            Presences
          </Link>
          <Link
            href="/medical"
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            <Heart className="h-4 w-4 text-muted-foreground shrink-0" />
            Infirmerie
          </Link>
        </div>
      )}

      {/* Partie 1 — Informations globales */}
      <EventInfoCard
        date={eventDate}
        meetingTime={event.meeting_time}
        location={event.location}
        isCoach={isCoach}
        myPresence={myPresence}
        convocationsSent={!!event.convocations_sent_at}
        onRespond={myPresence ? (status, reason) => updateAttendance(myPresence.playerId, status, reason) : undefined}
      />

      {/* Météo du jour J */}
      <WeatherWidget
        eventId={trainingId}
        eventDate={event.event_date}
        latitude={event.latitude ?? null}
        longitude={event.longitude ?? null}
        location={event.location}
        isCoach={isCoach}
      />

      {/* Playlist de vestiaire */}
      <LockerPlaylist
        eventId={trainingId}
        teamId={currentTeam.id}
        isCoach={isCoach}
        userId={user?.id ?? ""}
      />

      {/* Partie 2 — Liste des présents et absents */}
      <AttendanceLists
        players={players}
        isCoach={isCoach}
        convocationsSent={!!event.convocations_sent_at}
        onUpdate={updateAttendance}
      />

      {/* État de forme (avant séance) */}
      <SessionFormCheckIn
        eventId={trainingId}
        teamId={currentTeam.id}
        isCoach={isCoach}
        userId={user?.id}
        userRole={userRole}
        childId={childId}
        trainingOver={event.status === "completed" || eventDate.getTime() < now}
      />

      {/* Suivi de charge (RPE) */}
      <SessionRpe
        eventId={trainingId}
        teamId={currentTeam.id}
        isCoach={isCoach}
        userId={user?.id}
        userRole={userRole}
        childId={childId}
        trainingOver={event.status === "completed" || eventDate.getTime() < now}
        durationHint={90}
      />

      {/* Analyse de séance post-entraînement */}
      <SessionFeedback
        eventId={trainingId}
        teamId={currentTeam.id}
        isCoach={isCoach}
        userId={user?.id}
        userRole={userRole}
        childId={childId}
        trainingOver={event.status === "completed" || eventDate.getTime() < now}
      />

      {/* Relance combinée RPE / analyse de séance (coach uniquement, séance passée) */}
      {isCoach && eventDate.getTime() < now && missingResponderCount > 0 && (
        <SessionRemindersCard trainingId={trainingId} missingCount={missingResponderCount} />
      )}

      <ConvocationsDialog
        event={event}
        open={convDialogOpen}
        onOpenChange={setConvDialogOpen}
      />

      {event && (
        <AnnouncementDialog
          open={announcementOpen}
          onOpenChange={setAnnouncementOpen}
          teamId={currentTeam.id}
          event={{
            id: event.id,
            eventType: event.type,
            title: event.title,
            meeting_time: event.meeting_time,
            location: event.location,
            opponent: event.opponent ?? null,
          }}
        />
      )}
    </div>
  );
}
