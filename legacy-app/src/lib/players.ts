"use client";

import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types";

export async function fetchTeamActivePlayers(
  teamId: string,
  roles: Array<"player" | "coach" | "parent" | "owner"> = ["player"]
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

  return (profiles as Profile[]) || [];
}

export async function countTeamActivePlayers(teamId: string): Promise<number> {
  return (await fetchTeamActivePlayers(teamId)).length;
}
