"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock } from "lucide-react";
import type { Attendance, Event } from "@/types";

export function PendingConvocations() {
  const { data: session } = useSession();
  const [attendances, setAttendances] = useState<
    (Attendance & { event: Event })[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    const supabase = createClient();

    async function fetchPending() {
      const { data } = await supabase
        .from("attendances")
        .select("*, event:events!attendances_event_id_fkey(*)")
        .eq("user_id", session!.user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      setAttendances((data as (Attendance & { event: Event })[]) || []);
      setLoading(false);
    }

    fetchPending();
  }, [session?.user?.id]);

  async function respond(
    attendanceId: string,
    status: "present" | "absent" | "late"
  ) {
    const supabase = createClient();
    await supabase
      .from("attendances")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", attendanceId);

    setAttendances((prev) => prev.filter((a) => a.id !== attendanceId));
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
                className="flex items-center justify-between rounded-lg border p-3"
              >
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
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
