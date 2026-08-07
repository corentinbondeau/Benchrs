"use client";

import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";

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
