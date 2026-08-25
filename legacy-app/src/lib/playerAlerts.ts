"use client";

import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";

export async function fetchTeamRecipientIds(teamId: string): Promise<string[]> {
  try {
    const supabase = createClient();
    const { data: players } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("role", "player");
    const playerIds = (players || []).map((p) => (p as { user_id: string }).user_id);
    if (playerIds.length === 0) return [];

    const { data: active } = await supabase
      .from("profiles")
      .select("id")
      .in("id", playerIds)
      .neq("is_active", false);
    const activeIds = (active || []).map((p) => (p as { id: string }).id);

    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .in("student_id", playerIds);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    return [...new Set([...activeIds, ...parentIds])];
  } catch (err) {
    console.error("[recipients] fetch error:", err);
    return [];
  }
}

export async function notifyPhysicalTest({
  playerId,
  playerName,
  testType,
  value,
  teamId,
}: {
  playerId: string;
  playerName: string;
  testType: "vma" | "vmi";
  value: number;
  teamId: string;
}) {
  try {
    const supabase = createClient();
    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .eq("student_id", playerId);
    const parentIds = [
      ...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id)),
    ];
    const userIds = [...new Set([playerId, ...parentIds])];
    const label = testType === "vma" ? "VMA" : "VMI";

    await authFetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: userIds,
        title: `Nouvelle ${label} enregistrée`,
        body: `${playerName} : ${label} à ${value} km/h`,
        type: "physical",
        reference_id: playerId,
        team_id: teamId,
        url: `/stats/${playerId}`,
      }),
    });
  } catch (err) {
    console.error("[physical] notify error:", err);
  }
}

export async function notifyDeparture({
  eventId,
  teamId,
  location,
  kind,
  url,
}: {
  eventId: string;
  teamId: string;
  location: string | null;
  kind: "depart" | "arrival";
  url: string;
}) {
  try {
    const supabase = createClient();
    const { data: players } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("role", "player");
    const playerIds = (players || []).map((p) => (p as { user_id: string }).user_id);
    if (playerIds.length === 0) return;

    const { data: active } = await supabase
      .from("profiles")
      .select("id")
      .in("id", playerIds)
      .neq("is_active", false);

    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .in("student_id", playerIds);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const activeIds = (active || []).map((p) => (p as { id: string }).id);
    const userIds = [...new Set([...activeIds, ...parentIds])];
    if (userIds.length === 0) return;

    const isDepart = kind === "depart";
    await authFetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: userIds,
        title: isDepart ? "On est parti ! 🚌" : "On est arrivés au stade 🏟️",
        body: isDepart
          ? `L'équipe a quitté le point de rendez-vous${location ? ` (${location})` : ""}. Pensez aux horaires de ramassage.`
          : `L'équipe est bien arrivée${location ? ` à ${location}` : ""}.`,
        type: "on_est_parti",
        reference_id: `${eventId}:${kind}`,
        team_id: teamId,
        url,
      }),
    });
  } catch (err) {
    console.error("[on_est_parti] notify error:", err);
  }
}
