"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Check, X, ChevronDown, UserPlus, Trash2, Calendar, Bell, Send } from "lucide-react";
import { toast } from "sonner";
import { fetchTeamActivePlayers } from "@/lib/players";
import type { Event, Attendance, Profile } from "@/types";

interface EventWithAttendances extends Event {
  attendances: (Attendance & { profile?: Profile })[];
}

interface ConvocationsDialogProps {
  event: Event;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  excused: "bg-blue-100 text-blue-700",
  pending: "bg-gray-100 text-gray-700",
};

const statusLabels: Record<string, string> = {
  present: "Présent",
  absent: "Absent",
  late: "En retard",
  excused: "Excusé",
  pending: "En attente",
};

export function ConvocationsDialog({ event, open, onOpenChange }: ConvocationsDialogProps) {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [eventData, setEventData] = useState<EventWithAttendances | null>(null);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentTeam || !event) return;
    const supabase = createClient();

    const { data: evt } = await supabase
      .from("events")
      .select("*")
      .eq("id", event.id)
      .single();

    const playersData = await fetchTeamActivePlayers(currentTeam.id);

    const { data: attData } = await supabase
      .from("attendances")
      .select("*, profile:profiles!attendances_user_id_fkey(first_name, last_name)")
      .eq("event_id", event.id)
      .eq("team_id", currentTeam.id);

    setEventData({
      ...(evt as Event),
      attendances: (attData || []) as EventWithAttendances["attendances"],
    });
    setPlayers(playersData);
    setLoading(false);
  }, [event?.id, currentTeam]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  async function addConvocation(playerId: string) {
    const supabase = createClient();
    const { error } = await supabase.from("attendances").insert({
      event_id: event.id,
      user_id: playerId,
      status: "pending",
      team_id: currentTeam!.id,
    });
    if (error) {
      toast.error("Erreur lors de l'ajout");
      return;
    }
    toast.success("Joueur convoqué");
    setAddPlayerOpen(false);
    fetchData();
  }

  async function convocateAll() {
    const supabase = createClient();
    if (!eventData) return;
    const convokedIds = new Set(eventData.attendances.map((a) => a.user_id));
    const toInsert = players
      .filter((p) => !convokedIds.has(p.id))
      .map((p) => ({ event_id: event.id, user_id: p.id, status: "pending", team_id: currentTeam!.id }));
    if (toInsert.length === 0) {
      toast.info("Tous les joueurs sont déjà convoqués");
      return;
    }
    const { error } = await supabase.from("attendances").insert(toInsert);
    if (error) {
      toast.error("Erreur lors de la convocation");
      return;
    }
    toast.success(`${toInsert.length} joueur(s) convoqué(s)`);
    fetchData();
  }

  async function updateAttendanceStatus(attendanceId: string, status: string) {
    const supabase = createClient();
    const { error } = await supabase.from("attendances").update({ status }).eq("id", attendanceId);
    if (error) {
      toast.error("Erreur");
      return;
    }
    toast.success("Statut mis à jour");
    fetchData();
  }

  async function removeConvocation(attendanceId: string) {
    const supabase = createClient();
    await supabase.from("attendances").delete().eq("id", attendanceId);
    toast.success("Convocation supprimée");
    fetchData();
  }

  async function respondToConvocation(attendanceId: string, status: "present" | "absent", reason?: string) {
    const supabase = createClient();
    const update: Record<string, unknown> = { status, responded_at: new Date().toISOString() };
    if (status === "absent" && reason) update.absence_reason = reason;
    const { error } = await supabase.from("attendances").update(update).eq("id", attendanceId);
    if (error) {
      toast.error("Erreur lors de la réponse");
      return;
    }
    toast.success(status === "present" ? "Présence confirmée" : "Absence signalée");
    fetchData();
  }

  async function sendConvocationPush() {
    if (!eventData) return;
    const pendingAtts = eventData.attendances.filter((a) => a.status === "pending");
    if (pendingAtts.length === 0) {
      toast.info("Aucune convocation en attente à envoyer");
      return;
    }
    const res = await fetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: pendingAtts.map((a) => a.user_id),
        title: `Convocation: ${eventData.title}`,
        body: `Vous êtes convoqué(e) le ${new Date(eventData.event_date).toLocaleDateString("fr-FR")}`,
        type: "convocation",
        reference_id: eventData.id,
        team_id: currentTeam!.id,
        url: "/calendar",
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error || "Erreur lors de l'envoi");
      return;
    }
    toast.success(`${pendingAtts.length} notification(s) envoyée(s)`);
  }

  if (!currentTeam) return null;

  const myAttendance = eventData?.attendances?.find((a) => a.user_id === user?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Convocations — {event.title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
        ) : isCoach ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {eventData?.attendances.length || 0} convoqué(s)
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={sendConvocationPush}>
                  <Send className="h-3 w-3 mr-1" />
                  Envoyer
                </Button>
                <Button size="sm" variant="outline" onClick={convocateAll}>
                  <Users className="h-3 w-3 mr-1" />
                  Tout convoquer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddPlayerOpen(true)}>
                  <UserPlus className="h-3 w-3 mr-1" />
                  Ajouter
                </Button>
              </div>
            </div>

            {addPlayerOpen && (
              <div className="space-y-2">
                <Label>Ajouter un joueur</Label>
                <Select onValueChange={(v: string | null) => { if (v) addConvocation(v); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un joueur" />
                  </SelectTrigger>
                  <SelectContent>
                    {players
                      .filter((p) => !eventData?.attendances.some((a) => a.user_id === p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {eventData && eventData.attendances.length > 0 ? (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {eventData.attendances.map((att) => (
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
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <button className={`inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-full border-0 ${statusColors[att.status || "pending"]}`}>
                            {statusLabels[att.status || "pending"]}
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </button>
                        } />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => updateAttendanceStatus(att.id, "present")}>Présent</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateAttendanceStatus(att.id, "absent")}>Absent</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateAttendanceStatus(att.id, "late")}>En retard</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateAttendanceStatus(att.id, "excused")}>Excusé</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => updateAttendanceStatus(att.id, "pending")}>En attente</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeConvocation(att.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">Aucun joueur convoqué</p>
            )}
          </div>
        ) : myAttendance ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
              <div className={`h-3 w-3 rounded-full ${myAttendance.status === "present" ? "bg-green-500" : myAttendance.status === "absent" ? "bg-red-500" : myAttendance.status === "late" ? "bg-amber-500" : myAttendance.status === "excused" ? "bg-blue-500" : "bg-gray-400"}`} />
              <div>
                <p className="font-medium">Statut: {statusLabels[myAttendance.status] || myAttendance.status}</p>
                {myAttendance.responded_at && (
                  <p className="text-xs text-muted-foreground">
                    Répondu le {new Date(myAttendance.responded_at).toLocaleDateString("fr-FR")}
                  </p>
                )}
              </div>
            </div>
            {myAttendance.status === "pending" && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Button className="bg-green-600 text-white hover:bg-green-700 flex-1" onClick={() => respondToConvocation(myAttendance.id, "present")}>
                    <Check className="h-4 w-4 mr-1" />
                    Présent
                  </Button>
                  <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 flex-1" onClick={() => respondToConvocation(myAttendance.id, "absent")}>
                    <X className="h-4 w-4 mr-1" />
                    Absent
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Vous n&apos;êtes pas convoqué à cet événement</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
