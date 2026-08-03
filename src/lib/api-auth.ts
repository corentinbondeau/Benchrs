import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getAuthUser(req: Request): Promise<User | null> {
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return null;
  const { data, error } = await createAdminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export function unauthorized() {
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
}

export async function getUserTeamIds(userId: string): Promise<string[]> {
  const { data } = await createAdminClient()
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  return (data || []).map((r) => r.team_id as string);
}

export async function isTeamMember(userId: string, teamId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("team_members")
    .select("id")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .maybeSingle();
  return !!data;
}

export async function getTeamRole(
  userId: string,
  teamId: string
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("team_members")
    .select("role")
    .eq("user_id", userId)
    .eq("team_id", teamId)
    .maybeSingle();
  return (data?.role as string) ?? null;
}

export async function isTeamCoach(
  userId: string,
  teamId: string
): Promise<boolean> {
  const role = await getTeamRole(userId, teamId);
  return role === "owner" || role === "coach";
}
