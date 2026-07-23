"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar,
  MapPin,
  Clock,
  User,
  Check,
  X,
  TrendingUp,
} from "lucide-react";
import type { Profile, Event, Attendance } from "@/types";

interface ChildProfile extends Profile {
  shirt_number: number | null;
  position: string | null;
}

export function ParentDashboard() {
  const { user } = useAuth();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [nextEvent, setNextEvent] = useState<Event | null>(null);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [pendingConvs, setPendingConvs] = useState<
    (Attendance & { event: Event })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [absenceReason, setAbsenceReason] = useState("");
  const [pendingAbsentId, setPendingAbsentId] = useState<string | null>(null);
  const [noChild, setNoChild] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();

    async function fetchParentData() {
      const { data: link } = await supabase
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", user!.id)
        .single();

      if (!link) {
        setNoChild(true);
        setLoading(false);
        return;
      }

      const { data: childProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", link.student_id)
        .single();

      if (childProfile) {
        setChild(childProfile as ChildProfile);
      }

      const [nextEventRes, attRes, convsRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .in("status", ["upcoming", "ongoing"])
          .gte("event_date", new Date().toISOString())
          .order("event_date", { ascending: true })
          .limit(1)
          .single(),
        supabase
          .from("attendances")
          .select("status")
          .eq("user_id", link.student_id),
        supabase
          .from("attendances")
          .select("*, event:events!attendances_event_id_fkey(*)")
          .eq("user_id", link.student_id)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);

      if (nextEventRes.data) setNextEvent(nextEventRes.data as Event);

      const attendances = attRes.data || [];
      const total = attendances.length;
      const present = attendances.filter(
        (a) => a.status === "present" || a.status === "late"
      ).length;
      setAttendanceRate(total > 0 ? Math.round((present / total) * 100) : 0);

      setPendingConvs(
        (convsRes.data as (Attendance & { event: Event })[]) || []
      );
      setLoading(false);
    }

    fetchParentData();
  }, [user?.id]);

  async function respond(
    attendanceId: string,
    status: "present" | "absent" | "late",
    reason?: string
  ) {
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

    setPendingConvs((prev) => prev.filter((a) => a.id !== attendanceId));
    setPendingAbsentId(null);
    setAbsenceReason("");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Bonjour 👋</h2>
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (noChild) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">
            Bonjour, {user?.profile?.first_name} 👋
          </h2>
          <p className="text-muted-foreground mt-1">
            Espace parent
          </p>
        </div>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <div className="text-center">
            <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              Aucun joueur associé à votre compte
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Contactez un coach pour linker votre compte
            </p>
          </div>
        </div>
      </div>
    );
  }

  const eventDate = nextEvent ? new Date(nextEvent.event_date) : null;
  let countdown = "";
  if (eventDate) {
    const diffMs = eventDate.getTime() - Date.now();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
    );
    if (diffDays > 0) countdown = `${diffDays}j ${diffHours}h`;
    else if (diffHours > 0) countdown = `${diffHours}h`;
    else countdown = "Bientôt";
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">
          Bonjour, {user?.profile?.first_name} 👋
        </h2>
        <p className="text-muted-foreground mt-1">
          Espace parent
        </p>
      </div>

      {child && (
        <Card className="bg-gradient-to-r from-[var(--color-navy)] to-[var(--color-royal)] text-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-xl font-bold">
                {child.shirt_number ?? "?"}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">
                  {child.first_name} {child.last_name}
                </h3>
                <p className="text-white/70 text-sm">
                  {child.position || "Joueur"}
                </p>
              </div>
              {attendanceRate !== null && (
                <div className="text-right">
                  <div className="inline-flex items-center rounded-lg bg-white/20 px-3 py-1.5 text-sm font-bold">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    {attendanceRate}%
                  </div>
                  <p className="text-white/60 text-xs mt-1">Assiduité</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {nextEvent && eventDate && (
        <Card className="bg-gradient-to-r from-[var(--color-gold)] to-amber-400 text-[var(--color-navy)]">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-[var(--color-navy)]/60 text-sm font-medium uppercase tracking-wide">
                  {nextEvent.type === "match"
                    ? "Prochain match"
                    : "Prochain entraînement"}
                </p>
                <h3 className="text-xl font-bold">{nextEvent.title}</h3>
                {nextEvent.opponent && (
                  <p className="text-[var(--color-navy)]/80">
                    vs {nextEvent.opponent}
                  </p>
                )}
                <div className="flex items-center gap-4 text-sm text-[var(--color-navy)]/70">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {eventDate.toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {eventDate.toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {nextEvent.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {nextEvent.location}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center rounded-lg bg-[var(--color-navy)] px-3 py-1.5 text-sm font-bold text-white">
                  {countdown}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {pendingConvs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              Convocations de {child?.first_name}
              <Badge className="bg-[var(--color-gold)] text-[var(--color-navy)]">
                {pendingConvs.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingConvs.map((att) => (
                <div key={att.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{att.event?.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(att.event?.event_date).toLocaleDateString(
                          "fr-FR",
                          {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          }
                        )}
                      </p>
                    </div>
                    {pendingAbsentId !== att.id && (
                      <div className="flex gap-1.5">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 text-green-600 hover:bg-green-50"
                          onClick={() => respond(att.id, "present")}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 text-amber-600 hover:bg-amber-50"
                          onClick={() => respond(att.id, "late")}
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 text-red-600 hover:bg-red-50"
                          onClick={() => respond(att.id, "absent")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {pendingAbsentId === att.id && (
                    <div className="space-y-2 pt-1">
                      <Label className="text-xs">
                        Motif d&apos;absence (obligatoire)
                      </Label>
                      <Input
                        placeholder="Ex: Blessure, travail..."
                        value={absenceReason}
                        onChange={(e) => setAbsenceReason(e.target.value)}
                        className="text-sm h-8"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!absenceReason.trim()}
                          onClick={() =>
                            respond(att.id, "absent", absenceReason.trim())
                          }
                        >
                          Confirmer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            setPendingAbsentId(null);
                            setAbsenceReason("");
                          }}
                        >
                          Annuler
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <RecentResults />
    </div>
  );
}
