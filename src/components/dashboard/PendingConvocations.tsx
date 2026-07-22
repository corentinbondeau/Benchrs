"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Clock } from "lucide-react";
import type { Attendance, Event } from "@/types";

interface PendingConvocationsProps {
  showChild?: boolean;
}

export function PendingConvocations({ showChild }: PendingConvocationsProps) {
  const { data: session } = useSession();
  const [attendances, setAttendances] = useState<
    (Attendance & { event: Event })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [absenceReason, setAbsenceReason] = useState("");
  const [pendingAbsentId, setPendingAbsentId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    const supabase = createClient();

    async function fetchPending() {
      let targetUserId = session!.user!.id;

      if (showChild) {
        const { data: links } = await supabase
          .from("parent_student")
          .select("student_id")
          .eq("parent_id", session!.user!.id)
          .limit(1)
          .single();
        if (links) {
          targetUserId = links.student_id;
        } else {
          setLoading(false);
          return;
        }
      }

      const { data } = await supabase
        .from("attendances")
        .select("*, event:events!attendances_event_id_fkey(*)")
        .eq("user_id", targetUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      setAttendances((data as (Attendance & { event: Event })[]) || []);
      setLoading(false);
    }

    fetchPending();
  }, [session?.user?.id, showChild]);

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

    setAttendances((prev) => prev.filter((a) => a.id !== attendanceId));
    setPendingAbsentId(null);
    setAbsenceReason("");
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-24">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--royal)] border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500" />
          Convocations en attente
          {attendances.length > 0 && (
            <Badge className="bg-[var(--gold)] text-[var(--gold-foreground)]">
              {attendances.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attendances.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucune convocation en attente
          </p>
        ) : (
          <div className="space-y-3">
            {attendances.map((att) => (
              <div
                key={att.id}
                className="rounded-lg border p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{att.event?.title}</p>
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
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                        onClick={() => respond(att.id, "present")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                        onClick={() => respond(att.id, "late")}
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => respond(att.id, "absent")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {pendingAbsentId === att.id && (
                  <div className="space-y-2 pt-1">
                    <Label className="text-xs">Motif d&apos;absence (obligatoire)</Label>
                    <Input
                      placeholder="Ex: Blessure, travail, raison familiale..."
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
                        onClick={() => respond(att.id, "absent", absenceReason.trim())}
                      >
                        Confirmer l&apos;absence
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => { setPendingAbsentId(null); setAbsenceReason(""); }}
                      >
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
