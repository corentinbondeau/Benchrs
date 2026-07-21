import ical from "node-ical";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewEvent } from "@/lib/notifications/events";
import type { EventType } from "@/types";

interface ParsedEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date | null;
  location: string | null;
  description: string | null;
}

function extractStringValue(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null && "val" in val) {
    return String((val as { val: unknown }).val);
  }
  return String(val);
}

function classifyEvent(summary: string, description: string | null): EventType {
  const text = `${summary} ${description || ""}`.toLowerCase();
  if (
    text.includes("match") ||
    text.includes("journée") ||
    text.includes("championnat") ||
    text.includes("coupe") ||
    text.includes("amical") ||
    text.includes("vs") ||
    text.includes("contre")
  ) {
    return "match";
  }
  return "training";
}

function extractOpponent(summary: string): string | null {
  const patterns = [
    /(?:vs|contre|@)\s+(.+)/i,
    /(.+?)\s+vs\.?\s+(.+)/i,
    /(?:match|journée)\s+(?:\d+\s*)?[-–]\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = summary.match(pattern);
    if (match) {
      return (match[2] || match[1] || "").trim();
    }
  }
  return null;
}

export async function syncFromIcal(
  icalUrl: string
): Promise<{ eventsSynced: number; error: string | null }> {
  const supabase = createAdminClient();
  let eventsSynced = 0;

  try {
    const url = icalUrl.replace(/^webcal:\/\//, "https://");
    const data = await ical.async.fromURL(url);

    const events: ParsedEvent[] = [];

    for (const key of Object.keys(data)) {
      const ev = data[key];
      if (!ev || typeof ev !== "object" || !("type" in ev) || ev.type !== "VEVENT") continue;

      const vevent = ev as import("node-ical").VEvent;

      const startDate = vevent.start instanceof Date
        ? vevent.start
        : new Date(String(vevent.start));
      const endDate = vevent.end
        ? (vevent.end instanceof Date ? vevent.end : new Date(String(vevent.end)))
        : null;

      if (isNaN(startDate.getTime())) continue;

      const summary = extractStringValue(vevent.summary) || "Événement SportEasy";
      const location = extractStringValue(vevent.location);
      const description = extractStringValue(vevent.description);

      events.push({
        uid: String(vevent.uid || `${startDate.getTime()}-${summary}`),
        summary,
        dtstart: startDate,
        dtend: endDate && !isNaN(endDate.getTime()) ? endDate : null,
        location,
        description,
      });
    }

    for (const event of events) {
      const eventType = classifyEvent(event.summary, event.description);
      const opponent = eventType === "match" ? extractOpponent(event.summary) : null;

      const { data: existing } = await supabase
        .from("events")
        .select("id")
        .eq("sporteasy_id", event.uid)
        .single();

      const eventData = {
        sporteasy_id: event.uid,
        type: eventType,
        title: event.summary,
        event_date: event.dtstart.toISOString(),
        end_date: event.dtend?.toISOString() || null,
        location: event.location,
        status: "upcoming" as const,
        opponent,
      };

      if (existing) {
        await supabase
          .from("events")
          .update(eventData)
          .eq("id", existing.id);
      } else {
        const { data: newEvent } = await supabase
          .from("events")
          .insert(eventData)
          .select("id")
          .single();

        if (newEvent) {
          await notifyNewEvent({
            id: newEvent.id,
            title: event.summary,
            type: eventType,
            event_date: event.dtstart.toISOString(),
            location: event.location,
          });
        }
      }

      eventsSynced++;
    }

    await supabase.from("sporteasy_sync_log").insert({
      sync_type: "ical",
      status: "success",
      records_synced: eventsSynced,
    });

    return { eventsSynced, error: null };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Erreur inconnue";

    await supabase.from("sporteasy_sync_log").insert({
      sync_type: "ical",
      status: "error",
      records_synced: 0,
      error_message: errorMsg,
    });

    return { eventsSynced, error: errorMsg };
  }
}
