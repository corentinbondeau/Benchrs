"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Check, X, Clock, UserPlus, Trash2, Calendar } from "lucide-react";
import type { Event, Attendance, Profile } from "@/types";

interface EventWithAttendances extends Event {
  attendances: (Attendance & { profile?: Profile })[];
}

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  excused: "bg-blue-100 text-blue-700",
  pending: "bg-gray-100 text-gray-700",
};

const statusLabels: Record<string, string> = {
  present: "Present",
  absent: "Absent",
  late: "En retard",
  excused: "Excuse",
  pending: "En attente",
};

export default function ConvocationsPage() {
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";
  const [events, setEvents] = useState<EventWithAttendances[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPlayerEventId, setAddPlayerEventId] = useState<string | null>(null);
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const { data: eventsData } = await supabase
      .from("events")
      .select("*")
      .eq("status", "upcoming")
      .order("event_date", { ascending: true });

    const { data: playersData } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "player")
      .eq("is_active", true)
      .order("last_name", { ascending: true });

    const eventIds = (eventsData || []).map((e) => e.id);
    const { data: attendancesData } = eventIds.length > 0
      ? await supabase
          .from("attendances")
          .select("*, profile:profiles!attendances_user_id_fkey(first_name, last_name)")
          .in("event_id", eventIds)
      : { data: [] };

    const eventsWithAttendances: EventWithAttendances[] = (eventsData || []).map((event) => ({
      ...event,
      attendances: (attendancesData || []).filter((a) => a.event_id === event.id) as EventWithAttendances["attendances"],
    }));

    setEvents(eventsWithAttendances);
    setPlayers((playersData as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function addConvocation(eventId: string, playerId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("attendances").insert({
      event_id: eventId,
      user_id: playerId,
      status: "pending",
    });
    if (error) {
      toast.error("Erreur lors de l'ajout de la convocation");
      return;
    }
    toast.success("Convocation ajoutee");
    setAddPlayerEventId(null);
    fetchData();
  }

  async function convocateAll(eventId: string) {
    const supabase = createClient();
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    const convokedIds = new Set(event.attendances.map((a) => a.user_id));
    const toInsert = players
      .filter((p) => !convokedIds.has(p.id))
      .map((p) => ({ event_id: eventId, user_id: p.id, status: "pending" }));
    if (toInsert.length === 0) {
      toast.info("Tous les joueurs sont deja convoques");
      return;
    }
    const { error } = await supabase.from("attendances").insert(toInsert);
    if (error) {
      toast.error("Erreur lors de la convocation");
      return;
    }
    toast.success(`${toInsert.length} joueur(s) convoque(s)`);
    fetchData();
  }

  async function removeConvocation(attendanceId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("attendances").delete().eq("id", attendanceId);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    toast.success("Convocation supprimee");
    fetchData();
  }

  async function respondToConvocation(attendanceId: string, status: "present" | "absent", reason?: string) {
    const supabase = createClient();
    const update: Record<string, unknown> = {
      status,
      responded_at: new Date().toISOString(),
    };
    if (status === "absent" && reason) {
      update.absence_reason = reason;
    }
    const { error } = await supabase.from("attendances").update(update).eq("id", attendanceId);
    if (error) {
      toast.error("Erreur lors de la reponse");
      return;
    }
    toast.success(status === "present" ? "Presence confirmee" : "Absence signalee");
    fetchData();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Convocations</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Convocations</h2>
        <p className="text-muted-foreground mt-1">Gestion des convocations aux evenements</p>
      </div>

      {isCoach ? (
        <CoachView
          events={events}
          players={players}
          addPlayerEventId={addPlayerEventId}
          setAddPlayerEventId={setAddPlayerEventId}
          addConvocation={addConvocation}
          convocateAll={convocateAll}
          removeConvocation={removeConvocation}
        />
      ) : (
        <PlayerView
          events={events}
          userId={user?.id || ""}
          reasonInputs={reasonInputs}
          setReasonInputs={setReasonInputs}
          respondToConvocation={respondToConvocation}
        />
      )}
    </div>
  );
}

function CoachView({
  events,
  players,
  addPlayerEventId,
  setAddPlayerEventId,
  addConvocation,
  convocateAll,
  removeConvocation,
}: {
  events: EventWithAttendances[];
  players: Profile[];
  addPlayerEventId: string | null;
  setAddPlayerEventId: (id: string | null) => void;
  addConvocation: (eventId: string, playerId: string) => void;
  convocateAll: (eventId: string) => void;
  removeConvocation: (attendanceId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Aucun evenement a venir</p>
          </CardContent>
        </Card>
      ) : (
        events.map((event) => (
          <Card key={event.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{event.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(event.event_date).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={event.type === "match" ? "default" : "secondary"}>
                    {event.type === "match" ? "Match" : "Entrainement"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {event.attendances.length} convoque(s)
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/10"
                    onClick={() => convocateAll(event.id)}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Tout convoquer
                  </Button>
                  <Dialog open={addPlayerEventId === event.id} onOpenChange={(open) => setAddPlayerEventId(open ? event.id : null)}>
                    <DialogTrigger render={<Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
                      <UserPlus className="h-4 w-4 mr-1" />
                      Ajouter
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Ajouter un joueur</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <Select<string>
                          onValueChange={(value) => {
                            if (value) addConvocation(event.id, value);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selectionner un joueur" />
                          </SelectTrigger>
                          <SelectContent>
                            {players
                              .filter((p) => !event.attendances.some((a) => a.user_id === p.id))
                              .map((player) => (
                                <SelectItem key={player.id} value={player.id}>
                                  {player.first_name} {player.last_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {event.attendances.length > 0 ? (
                <div className="space-y-2">
                  {event.attendances.map((att) => (
                    <div key={att.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {att.profile?.first_name} {att.profile?.last_name}
                        </p>
                        {att.absence_reason && (
                          <p className="text-xs text-muted-foreground">Raison: {att.absence_reason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColors[att.status] || "bg-gray-100"}>
                          {statusLabels[att.status] || att.status}
                        </Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeConvocation(att.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucun joueur convoque
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function PlayerView({
  events,
  userId,
  reasonInputs,
  setReasonInputs,
  respondToConvocation,
}: {
  events: EventWithAttendances[];
  userId: string;
  reasonInputs: Record<string, string>;
  setReasonInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  respondToConvocation: (attendanceId: string, status: "present" | "absent", reason?: string) => void;
}) {
  const myAttendances = events
    .flatMap((e) =>
      e.attendances
        .filter((a) => a.user_id === userId)
        .map((a) => ({ ...a, event: e }))
    )
    .sort((a, b) => new Date(a.event.event_date).getTime() - new Date(b.event.event_date).getTime());

  return (
    <div className="space-y-4">
      {myAttendances.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Aucune convocation pour le moment</p>
          </CardContent>
        </Card>
      ) : (
        myAttendances.map((att) => (
          <Card key={att.id}>
            <CardContent className="py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-medium">{att.event.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(att.event.event_date).toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <div className="mt-2">
                    <Badge className={statusColors[att.status] || "bg-gray-100"}>
                      {statusLabels[att.status] || att.status}
                    </Badge>
                  </div>
                  {att.absence_reason && (
                    <p className="text-xs text-muted-foreground mt-1">Raison: {att.absence_reason}</p>
                  )}
                </div>
                {att.status === "pending" && (
                  <div className="flex flex-col gap-2 ml-4">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-green-600 text-white hover:bg-green-700"
                        onClick={() => respondToConvocation(att.id, "present")}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-600 hover:bg-red-50"
                        onClick={() => {
                          const reason = reasonInputs[att.id];
                          respondToConvocation(att.id, "absent", reason);
                        }}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Absent
                      </Button>
                    </div>
                    <Input
                      placeholder="Raison (optionnel)"
                      value={reasonInputs[att.id] || ""}
                      onChange={(e) =>
                        setReasonInputs((prev) => ({ ...prev, [att.id]: e.target.value }))
                      }
                      className="text-xs h-8"
                    />
                  </div>
                )}
                {att.status !== "pending" && (
                  <div className="ml-4">
                    {att.responded_at && (
                      <p className="text-xs text-muted-foreground">
                        Repondu le {new Date(att.responded_at).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
