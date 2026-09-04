"use client";

import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

export async function fetchTeamActivePlayers(
  teamId: string,
  roles: Array<"player" | "coach" | "parent" | "owner"> = ["player"],
  { excludeInjured = false }: { excludeInjured?: boolean } = {}
): Promise<Profile[]> {
  const supabase = createClient();

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .in("role", roles);

  const userIds = (members || []).map((m) => m.user_id);
  if (userIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds)
    .eq("is_active", true);

  let result = (profiles as Profile[]) || [];

  if (excludeInjured) {
    const { data: activeInjuries } = await supabase
      .from("injuries")
      .select("player_id")
      .eq("team_id", teamId)
      .eq("status", "active");
    const injuredIds = new Set(
      (activeInjuries || []).map((i) => (i as { player_id: string }).player_id)
    );
    result = result.filter((p) => !injuredIds.has(p.id));
  }

  return result;
}

export async function countTeamActivePlayers(teamId: string): Promise<number> {
  return (await fetchTeamActivePlayers(teamId)).length;
}
