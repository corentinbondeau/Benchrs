import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class ResponseError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function assertTeamMember(userId: string, teamId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("team_members").select("id").eq("user_id", userId).eq("team_id", teamId).maybeSingle();
  if (!data) throw new ResponseError("Accès refusé", 403);
}

export async function assertTeamCoach(userId: string, teamId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("team_members").select("role").eq("user_id", userId).eq("team_id", teamId).maybeSingle();
  const role = data?.role;
  if (role !== "coach" && role !== "owner") throw new ResponseError("Accès réservé au coach", 403);
}

export async function assertTeamOwner(userId: string, teamId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("team_members").select("role").eq("user_id", userId).eq("team_id", teamId).maybeSingle();
  if (data?.role !== "owner") throw new ResponseError("Accès réservé au propriétaire", 403);
}

export function handleGuardError(err: unknown) {
  if (err instanceof ResponseError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[guard]", err);
  return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
}
