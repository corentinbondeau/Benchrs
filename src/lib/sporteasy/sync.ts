import { sporteasy } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventType, AttendanceStatus } from "@/types";

function mapSportEasyStatus(
  status: string
): AttendanceStatus {
  const map: Record<string, AttendanceStatus> = {
    confirmed: "present",
    declined: "absent",
    tentative: "late",
    pending: "pending",
  };
  return map[status] || "pending";
}

export async function syncSportEasyData() {
  const supabase = createAdminClient();
  let eventsSynced = 0;
  let attendancesSynced = 0;
  let error: string | null = null;

  try {
    const events = await sporteasy.getEvents();

    for (const seEvent of events) {
      const eventType: EventType =
        seEvent.event_type === "match" ? "match" : "training";

      const { data: existingEvent } = await supabase
        .from("events")
        .select("id")
        .eq("sporteasy_id", String(seEvent.id))
        .single();

      const eventData = {
        sporteasy_id: String(seEvent.id),
        type: eventType,
        title: seEvent.name,
        event_date: seEvent.date,
        end_date: seEvent.end_date,
        location: seEvent.location,
        status: "upcoming" as const,
        opponent: eventType === "match" ? seEvent.name : null,
      };

      let eventId: string;

      if (existingEvent) {
        const { data: updated } = await supabase
          .from("events")
          .update(eventData)
          .eq("id", existingEvent.id)
          .select("id")
          .single();
        eventId = updated?.id || existingEvent.id;
      } else {
        const { data: inserted } = await supabase
          .from("events")
          .insert(eventData)
          .select("id")
          .single();
        eventId = inserted?.id || "";
      }

      eventsSynced++;

      if (eventId) {
        const attendances = await sporteasy.getEventAttendances(seEvent.id);

        for (const seAtt of attendances) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("sporteasy_member_id", seAtt.member_id)
            .single();

          if (profile) {
            await supabase.from("attendances").upsert(
              {
                event_id: eventId,
                user_id: profile.id,
                status: mapSportEasyStatus(seAtt.status),
              },
              { onConflict: "event_id,user_id" }
            );
            attendancesSynced++;
          }
        }
      }
    }

    await supabase.from("sporteasy_sync_log").insert({
      sync_type: "full",
      status: "success",
      records_synced: eventsSynced + attendancesSynced,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
    await supabase.from("sporteasy_sync_log").insert({
      sync_type: "full",
      status: "error",
      records_synced: 0,
      error_message: error,
    });
  }

  return { eventsSynced, attendancesSynced, error };
}
