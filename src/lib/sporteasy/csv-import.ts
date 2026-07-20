import { createAdminClient } from "@/lib/supabase/admin";
import type { EventType, AttendanceStatus } from "@/types";

interface CSVRow {
  [key: string]: string;
}

function findColumn(
  headers: string[],
  patterns: string[]
): string | undefined {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const pattern of patterns) {
    const idx = lower.findIndex((h) => h.includes(pattern.toLowerCase()));
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

function parseFrenchDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const trimmed = dateStr.trim();

  // ISO format: 2024-03-15T18:00:00
  if (trimmed.includes("T")) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // French format: 15/03/2024 or 15/03/2024 18:00
  const slashMatch = trimmed.match(
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/
  );
  if (slashMatch) {
    const [, day, month, year, hour, min] = slashMatch;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour || "0"),
      parseInt(min || "0")
    );
  }

  return null;
}

function classifyEventType(
  row: CSVRow,
  typeCol?: string,
  summaryCol?: string
): EventType {
  if (typeCol) {
    const val = row[typeCol]?.toLowerCase() || "";
    if (val.includes("match") || val.includes("game")) return "match";
    if (val.includes("entraînement") || val.includes("training") || val.includes("practice"))
      return "training";
  }

  if (summaryCol) {
    const text = row[summaryCol]?.toLowerCase() || "";
    if (text.includes("match") || text.includes("journée") || text.includes("vs"))
      return "match";
  }

  return "training";
}

function mapAttendanceStatus(value: string): AttendanceStatus {
  const v = value.toLowerCase().trim();
  if (
    v.includes("present") ||
    v === "yes" ||
    v === "oui" ||
    v === "confirmed"
  )
    return "present";
  if (v.includes("absent") || v === "no" || v === "non") return "absent";
  if (v.includes("retard") || v === "late") return "late";
  if (v.includes("excus") || v === "excused") return "excused";
  return "pending";
}

export interface ImportResult {
  type: "events" | "attendances";
  imported: number;
  skipped: number;
  errors: string[];
}

export async function importEventsCSV(
  csvContent: string
): Promise<ImportResult> {
  const supabase = createAdminClient();
  const lines = csvContent.trim().split("\n");

  if (lines.length < 2) {
    return {
      type: "events",
      imported: 0,
      skipped: 0,
      errors: ["Le fichier CSV doit contenir au moins un en-tête et une ligne de données"],
    };
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

  const titleCol = findColumn(headers, ["titre", "title", "nom", "name", "summary", "événement", "event"]);
  const dateCol = findColumn(headers, ["date", "datetime", "jour", "day"]);
  const timeCol = findColumn(headers, ["heure", "hour", "time"]);
  const locationCol = findColumn(headers, ["lieu", "location", "terrain", "field", "adresse"]);
  const typeCol = findColumn(headers, ["type", "catégorie", "category"]);
  const opponentCol = findColumn(headers, ["adversaire", "opponent", "versus", "vs"]);

  if (!titleCol || !dateCol) {
    return {
      type: "events",
      imported: 0,
      skipped: 0,
      errors: [
        `Colonnes obligatoires manquantes. Trouvé: ${headers.join(", ")}. Requis: "titre" et "date"`,
      ],
    };
  }

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: CSVRow = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));

    try {
      let dateStr = row[dateCol] || "";
      if (timeCol && row[timeCol]) {
        dateStr += ` ${row[timeCol]}`;
      }

      const eventDate = parseFrenchDate(dateStr);
      if (!eventDate) {
        errors.push(`Ligne ${i + 1}: date invalide "${row[dateCol]}"`);
        skipped++;
        continue;
      }

      const title = row[titleCol] || "Événement";
      const eventType = classifyEventType(row, typeCol, titleCol);
      const opponent = opponentCol ? row[opponentCol] || null : null;

      await supabase.from("events").insert({
        type: eventType,
        title,
        event_date: eventDate.toISOString(),
        location: locationCol ? row[locationCol] || null : null,
        status: "upcoming",
        opponent: eventType === "match" ? opponent : null,
        sporteasy_id: `csv-${Date.now()}-${i}`,
      });

      imported++;
    } catch (e) {
      errors.push(
        `Ligne ${i + 1}: ${e instanceof Error ? e.message : "erreur inconnue"}`
      );
      skipped++;
    }
  }

  await supabase.from("sporteasy_sync_log").insert({
    sync_type: "csv_events",
    status: errors.length > 0 ? "partial" : "success",
    records_synced: imported,
    error_message: errors.length > 0 ? errors.join("; ") : null,
  });

  return { type: "events", imported, skipped, errors };
}

export async function importAttendanceCSV(
  csvContent: string
): Promise<ImportResult> {
  const supabase = createAdminClient();
  const lines = csvContent.trim().split("\n");

  if (lines.length < 2) {
    return {
      type: "attendances",
      imported: 0,
      skipped: 0,
      errors: ["Le fichier CSV doit contenir au moins un en-tête et une ligne de données"],
    };
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

  const nameCol = findColumn(headers, ["joueur", "player", "nom", "name", "membre", "member"]);
  const eventCol = findColumn(headers, ["événement", "event", "match", "entraînement", "training", "date"]);
  const statusCol = findColumn(headers, ["statut", "status", "présence", "attendance", "présent", "present"]);

  if (!nameCol || !statusCol) {
    return {
      type: "attendances",
      imported: 0,
      skipped: 0,
      errors: [
        `Colonnes manquantes. Trouvé: ${headers.join(", ")}. Requis: "joueur" et "statut"`,
      ],
    };
  }

  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: CSVRow = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));

    try {
      const playerName = row[nameCol] || "";
      const status = mapAttendanceStatus(row[statusCol] || "");

      // Find player by name
      const nameParts = playerName.split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      let playerId: string | null = null;

      if (lastName) {
        const { data: player } = await supabase
          .from("profiles")
          .select("id")
          .ilike("first_name", firstName)
          .ilike("last_name", lastName)
          .eq("role", "player")
          .single();
        playerId = player?.id || null;
      }

      if (!playerId) {
        const { data: player } = await supabase
          .from("profiles")
          .select("id")
          .or(`first_name.ilike.%${firstName}%,last_name.ilike.%${playerName}%`)
          .eq("role", "player")
          .single();
        playerId = player?.id || null;
      }

      if (!playerId) {
        errors.push(`Ligne ${i + 1}: joueur "${playerName}" introuvable`);
        skipped++;
        continue;
      }

      // Find matching event
      let eventId: string | null = null;
      if (eventCol && row[eventCol]) {
        const { data: event } = await supabase
          .from("events")
          .select("id")
          .ilike("title", `%${row[eventCol]}%`)
          .order("event_date", { ascending: false })
          .limit(1)
          .single();
        eventId = event?.id || null;
      }

      if (!eventId) {
        errors.push(`Ligne ${i + 1}: événement introuvable pour "${playerName}"`);
        skipped++;
        continue;
      }

      await supabase.from("attendances").upsert(
        {
          event_id: eventId,
          user_id: playerId,
          status,
          responded_at: new Date().toISOString(),
        },
        { onConflict: "event_id,user_id" }
      );

      imported++;
    } catch (e) {
      errors.push(
        `Ligne ${i + 1}: ${e instanceof Error ? e.message : "erreur inconnue"}`
      );
      skipped++;
    }
  }

  await supabase.from("sporteasy_sync_log").insert({
    sync_type: "csv_attendance",
    status: errors.length > 0 ? "partial" : "success",
    records_synced: imported,
    error_message: errors.length > 0 ? errors.join("; ") : null,
  });

  return { type: "attendances", imported, skipped, errors };
}
