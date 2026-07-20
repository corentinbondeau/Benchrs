"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AttendanceToggle } from "./AttendanceToggle";
import type { Attendance, Event, Profile, AttendanceStatus } from "@/types";

interface AttendanceTableProps {
  eventId?: string;
  eventType?: "match" | "training";
}

export function AttendanceTable({ eventId, eventType }: AttendanceTableProps) {
  const [attendances, setAttendances] = useState<
    (Attendance & { profile: Profile; event: Event })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchAttendances = useCallback(async () => {
    let query = supabase
      .from("attendances")
      .select(
        "*, profile:profiles!attendances_user_id_fkey(*), event:events!attendances_event_id_fkey(*)"
      )
      .order("created_at", { ascending: false });

    if (eventId) {
      query = query.eq("event_id", eventId);
    }

    if (eventType) {
      query = query.eq("event.type", eventType);
    }

    const { data } = await query.limit(200);
    setAttendances((data as (Attendance & { profile: Profile; event: Event })[]) || []);
    setLoading(false);
  }, [eventId, eventType, supabase]);

  useEffect(() => {
    fetchAttendances();
  }, [fetchAttendances]);

  function handleStatusChange(attendanceId: string, newStatus: AttendanceStatus) {
    setAttendances((prev) =>
      prev.map((a) => (a.id === attendanceId ? { ...a, status: newStatus } : a))
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Joueur</TableHead>
            <TableHead>Événement</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Statut</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {attendances.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                Aucune donnée de présence
              </TableCell>
            </TableRow>
          ) : (
            attendances.map((att) => (
              <TableRow key={att.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold">
                      {att.profile?.first_name?.[0]}
                      {att.profile?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {att.profile?.first_name} {att.profile?.last_name}
                      </p>
                      {att.profile?.shirt_number && (
                        <p className="text-xs text-muted-foreground">
                          #{att.profile.shirt_number}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {att.event?.type === "match" ? "⚽" : "🏃"} {att.event?.title}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(att.event?.event_date || att.created_at).toLocaleDateString(
                    "fr-FR",
                    { day: "numeric", month: "short" }
                  )}
                </TableCell>
                <TableCell>
                  <AttendanceToggle
                    attendanceId={att.id}
                    currentStatus={att.status}
                    onStatusChange={(status) =>
                      handleStatusChange(att.id, status)
                    }
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
