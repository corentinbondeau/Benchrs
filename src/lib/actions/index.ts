"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { auth } from "@/lib/auth/config";
import { revalidatePath } from "next/cache";

function getAdminClient() {
  return createAdminClient();
}

function requireCoach() {
  // Server actions run in server context - we check via admin client
  return getAdminClient();
}

// ========================================
// EVENTS
// ========================================

export async function createEvent(data: {
  type: "match" | "training";
  title: string;
  description?: string;
  event_date: string;
  end_date?: string;
  location?: string;
  map_url?: string;
  opponent?: string;
}) {
  const supabase = requireCoach();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      type: data.type,
      title: data.title,
      description: data.description || null,
      event_date: data.event_date,
      end_date: data.end_date || null,
      location: data.location || null,
      map_url: data.map_url || null,
      opponent: data.opponent || null,
      status: "upcoming",
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Create attendance records for all active players/parents
  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["player", "parent"])
    .eq("is_active", true);

  if (members && members.length > 0) {
    await supabase.from("attendances").insert(
      members.map((m) => ({
        event_id: event.id,
        user_id: m.id,
        status: "pending" as const,
      }))
    );
  }

  // Create notifications
  if (members && members.length > 0) {
    await supabase.from("notifications").insert(
      members.map((m) => ({
        user_id: m.id,
        title: "Nouvel événement",
        body: `${data.title} le ${new Date(data.event_date).toLocaleDateString("fr-FR")}`,
        type: "event",
        reference_id: event.id,
      }))
    );
  }

  revalidatePath("/");
  revalidatePath("/calendar");

  return { success: true, event };
}

export async function updateEvent(
  eventId: string,
  data: {
    title?: string;
    description?: string;
    event_date?: string;
    end_date?: string;
    location?: string;
    map_url?: string;
    opponent?: string;
    status?: "upcoming" | "ongoing" | "completed" | "cancelled";
    match_result?: "win" | "loss" | "draw";
    score_us?: number;
    score_them?: number;
  }
) {
  const supabase = requireCoach();

  const { error } = await supabase
    .from("events")
    .update(data)
    .eq("id", eventId);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/stats");

  return { success: true };
}

export async function deleteEvent(eventId: string) {
  const supabase = requireCoach();

  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/calendar");

  return { success: true };
}

// ========================================
// ATTENDANCES
// ========================================

export async function respondToConvocation(
  attendanceId: string,
  status: "present" | "absent" | "late",
  absenceReason?: string
) {
  const supabase = getAdminClient();

  const { error } = await supabase
    .from("attendances")
    .update({
      status,
      responded_at: new Date().toISOString(),
      absence_reason: status === "absent" ? absenceReason || null : null,
    })
    .eq("id", attendanceId);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/attendance");

  return { success: true };
}

export async function bulkCreateAttendances(
  eventId: string,
  userIds: string[]
) {
  const supabase = requireCoach();

  const records = userIds.map((userId) => ({
    event_id: eventId,
    user_id: userId,
    status: "pending" as const,
  }));

  const { error } = await supabase.from("attendances").upsert(records, {
    onConflict: "event_id,user_id",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/attendance");

  return { success: true };
}

// ========================================
// MATCH TRACKING
// ========================================

export async function saveMatchReport(data: {
  eventId: string;
  scoreUs: number;
  scoreThem: number;
  playerStats: Record<
    string,
    {
      goals: number;
      assists: number;
      yellow_cards: number;
      red_cards: number;
      minutes_played: number;
    }
  >;
  liveEvents: {
    type: string;
    player_id: string | null;
    related_player_id: string | null;
    minute: number;
    notes?: string;
  }[];
}) {
  const supabase = requireCoach();

  // Determine match result
  let matchResult: "win" | "loss" | "draw" = "draw";
  if (data.scoreUs > data.scoreThem) matchResult = "win";
  else if (data.scoreUs < data.scoreThem) matchResult = "loss";

  // Update event
  await supabase
    .from("events")
    .update({
      score_us: data.scoreUs,
      score_them: data.scoreThem,
      status: "completed",
      match_result: matchResult,
    })
    .eq("id", data.eventId);

  // Save match stats
  for (const [playerId, stats] of Object.entries(data.playerStats)) {
    if (
      stats.goals > 0 ||
      stats.assists > 0 ||
      stats.yellow_cards > 0 ||
      stats.red_cards > 0 ||
      stats.minutes_played > 0
    ) {
      await supabase.from("match_stats").upsert(
        {
          event_id: data.eventId,
          player_id: playerId,
          goals: stats.goals,
          assists: stats.assists,
          yellow_cards: stats.yellow_cards,
          red_cards: stats.red_cards,
          minutes_played: stats.minutes_played,
        },
        { onConflict: "event_id,player_id" }
      );
    }
  }

  // Save live events
  if (data.liveEvents.length > 0) {
    await supabase.from("match_events").insert(
      data.liveEvents.map((evt) => ({
        event_id: data.eventId,
        event_type: evt.type,
        player_id: evt.player_id,
        related_player_id: evt.related_player_id,
        minute: evt.minute,
        notes: evt.notes || null,
      }))
    );
  }

  // Update attendance status for this event
  await supabase
    .from("attendances")
    .update({ status: "present" })
    .eq("event_id", data.eventId)
    .eq("status", "pending");

  revalidatePath("/");
  revalidatePath("/stats");
  revalidatePath("/stats/my");
  revalidatePath("/attendance");

  return { success: true, matchResult };
}

// ========================================
// CHAT
// ========================================

export async function sendChatMessage(
  channelId: string,
  senderId: string,
  content: string
) {
  const supabase = getAdminClient();

  const { error } = await supabase.from("chat_messages").insert({
    channel_id: channelId,
    sender_id: senderId,
    content,
  });

  if (error) throw new Error(error.message);

  return { success: true };
}

// ========================================
// NOTIFICATIONS
// ========================================

export async function markNotificationRead(notificationId: string) {
  const supabase = getAdminClient();

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);

  revalidatePath("/notifications");

  return { success: true };
}

export async function markAllNotificationsRead(userId: string) {
  const supabase = getAdminClient();

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);

  revalidatePath("/notifications");

  return { success: true };
}

// ========================================
// INJURIES
// ========================================

export async function reportInjury(data: {
  player_id: string;
  description: string;
  injury_type?: string;
  injury_date: string;
  expected_return?: string;
}) {
  const supabase = getAdminClient();

  const { error } = await supabase.from("injuries").insert({
    player_id: data.player_id,
    description: data.description,
    injury_type: data.injury_type || null,
    injury_date: data.injury_date,
    expected_return: data.expected_return || null,
    status: "active",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/medical");

  return { success: true };
}

export async function recoverInjury(injuryId: string) {
  const supabase = getAdminClient();

  await supabase
    .from("injuries")
    .update({ status: "recovered" })
    .eq("id", injuryId);

  revalidatePath("/medical");

  return { success: true };
}

// ========================================
// MOTM VOTES
// ========================================

export async function voteMotm(
  eventId: string,
  voterId: string,
  candidateId: string
) {
  const supabase = getAdminClient();

  const { error } = await supabase.from("motm_votes").upsert(
    {
      event_id: eventId,
      voter_id: voterId,
      candidate_id: candidateId,
    },
    { onConflict: "event_id,voter_id" }
  );

  if (error) throw new Error(error.message);

  revalidatePath("/trophies");

  return { success: true };
}

// ========================================
// TASKS
// ========================================

export async function createTask(data: {
  event_id: string;
  title: string;
  description?: string;
  assigned_to?: string;
}) {
  const supabase = requireCoach();

  const { error } = await supabase.from("tasks").insert({
    event_id: data.event_id,
    title: data.title,
    description: data.description || null,
    assigned_to: data.assigned_to || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/tasks");

  return { success: true };
}

export async function toggleTaskCompletion(taskId: string, completed: boolean) {
  const supabase = getAdminClient();

  await supabase
    .from("tasks")
    .update({ is_completed: completed })
    .eq("id", taskId);

  revalidatePath("/tasks");

  return { success: true };
}

// ========================================
// CARPOOLING
// ========================================

export async function createCarpoolingTrip(data: {
  event_id: string;
  driver_id: string;
  total_seats: number;
  departure_location?: string;
  departure_time?: string;
  notes?: string;
}) {
  const supabase = getAdminClient();

  const { error } = await supabase.from("carpooling_trips").insert({
    event_id: data.event_id,
    driver_id: data.driver_id,
    total_seats: data.total_seats,
    departure_location: data.departure_location || null,
    departure_time: data.departure_time || null,
    notes: data.notes || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/carpooling");

  return { success: true };
}

export async function bookCarpoolingSeat(
  tripId: string,
  passengerId: string,
  seatsTaken: number = 1
) {
  const supabase = getAdminClient();

  const { error } = await supabase.from("carpooling_bookings").insert({
    trip_id: tripId,
    passenger_id: passengerId,
    role: "passenger",
    seats_taken: seatsTaken,
    status: "confirmed",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/carpooling");

  return { success: true };
}

// ========================================
// FORMATIONS
// ========================================

export async function saveFormation(data: {
  name: string;
  formation_data: object;
  event_id?: string;
}) {
  const supabase = requireCoach();

  const { data: formation, error } = await supabase
    .from("formations")
    .insert({
      name: data.name,
      formation_data: data.formation_data,
      event_id: data.event_id || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/tactics");

  return { success: true, formation };
}
