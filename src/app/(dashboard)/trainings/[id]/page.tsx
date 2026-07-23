"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Event, Profile } from "@/types";

type AttendanceStatus = "present" | "absent" | "late" | "excused" | "pending";

interface AttendanceEntry {
  id: string;
  user_id: string;
  status: AttendanceStatus;
  profile?: Profile;
}

function resolveProfile(raw: unknown): Profile | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) return (raw[0] as Profile) || undefined;
  return raw as Profile;
}

export default function TrainingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";
  const trainingId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [attendances, setAttendances] = useState<AttendanceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      const [eventRes, attRes] = await Promise.all([
        supabase
          .from("events")
          .select("*")
          .eq("id", trainingId)
          .single(),
        supabase
          .from("attendances")
          .select("id, user_id, status, profile:profiles!attendances_user_id_fkey(id, first_name, last_name, shirt_number, position)")
          .eq("event_id", trainingId),
      ]);

      setEvent(eventRes.data as Event | null);

      const rawAtts = (attRes.data || []) as Record<string, unknown>[];
      const parsed: AttendanceEntry[] = rawAtts.map((a) => ({
        id: a.id as string,
        user_id: a.user_id as string,
        status: a.status as AttendanceStatus,
        profile: resolveProfile(a.profile),
      }));
      setAttendances(parsed);

      setLoading(false);
    }

    fetchData();
  }, [trainingId]);

  async function updateAttendance(userId: string, status: AttendanceStatus) {
    const supabase = createClient();
    const existing = attendances.find((a) => a.user_id === userId);

    if (existing) {
      await supabase
        .from("attendances")
        .update({ status, responded_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase.from("attendances").insert({
        event_id: trainingId,
        user_id: userId,
        status,
        responded_at: new Date().toISOString(),
      });
    }

    setAttendances((prev) => {
      const idx = prev.findIndex((a) => a.user_id === userId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], status };
        return updated;
      }
      return [...prev, { id: "", user_id: userId, status }];
    });

    toast.success(status === "present" ? "Présence enregistrée" : "Absence enregistrée");
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
  const present = attendances.filter((a) => a.status === "present" || a.status === "late");
  const absent = attendances.filter((a) => a.status === "absent" || a.status === "pending");
  const excused = attendances.filter((a) => a.status === "excused");

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
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-white/80">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {eventDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {eventDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {event.location}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Attendance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--color-gold)]" />
              Présences
              {attendances.length > 0 && (
                <span className="text-sm font-normal text-muted-foreground">
                  — {present.length}/{attendances.length}
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {attendances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune présence enregistrée
            </p>
          ) : (
            <div className="space-y-4">
              {present.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-600 mb-2">
                    Présents ({present.length})
                  </p>
                  <div className="space-y-1">
                    {present.map((a) => (
                      <div
                        key={a.user_id}
                        className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2"
                      >
                        <span className="font-bold text-xs w-7 text-center text-green-700">
                          {a.profile?.shirt_number ?? "?"}
                        </span>
                        <span className="flex-1 text-sm text-green-900">
                          {a.profile?.first_name} {a.profile?.last_name}
                        </span>
                        {isCoach && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => updateAttendance(a.user_id, "absent")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {absent.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-2">
                    Absents ({absent.length})
                  </p>
                  <div className="space-y-1">
                    {absent.map((a) => (
                      <div
                        key={a.user_id}
                        className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2"
                      >
                        <span className="font-bold text-xs w-7 text-center text-red-700">
                          {a.profile?.shirt_number ?? "?"}
                        </span>
                        <span className="flex-1 text-sm text-red-900">
                          {a.profile?.first_name} {a.profile?.last_name}
                        </span>
                        {isCoach && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-green-500 hover:text-green-700 hover:bg-green-50"
                            onClick={() => updateAttendance(a.user_id, "present")}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {excused.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-600 mb-2">
                    Excusés ({excused.length})
                  </p>
                  <div className="space-y-1">
                    {excused.map((a) => (
                      <div
                        key={a.user_id}
                        className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2"
                      >
                        <span className="font-bold text-xs w-7 text-center text-amber-700">
                          {a.profile?.shirt_number ?? "?"}
                        </span>
                        <span className="flex-1 text-sm text-amber-900">
                          {a.profile?.first_name} {a.profile?.last_name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
