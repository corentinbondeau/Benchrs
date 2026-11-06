import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Create a temporary player for a team
 * 
 * Note: Created players are automatically deleted every Monday
 * via the /api/cron/reset-players cron job. This allows coaches to create
 * ad-hoc players for tests, reserves, etc., without cluttering the database.
 */
export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  const body = await req.json();
  const { team_id, first_name, last_name, shirt_number } = body;

  if (!team_id || !first_name || !last_name) {
    return NextResponse.json(
      { error: "Missing required fields: team_id, first_name, last_name" },
      { status: 400 }
    );
  }

  // Step 1: Create an auth user first (required for profiles foreign key)
  const tempEmail = `temp-${crypto.randomUUID().slice(0, 8)}@benchrs.app`;
  const tempPassword = crypto.randomUUID();

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    console.error("Error creating auth user:", authError);
    return NextResponse.json(
      {
        error: "Failed to create auth user",
        details: authError?.message || "Unknown error",
      },
      { status: 500 }
    );
  }

  const playerId = authData.user.id;

  // Step 2: Create a profile entry for the new player
  const { data: newProfile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      id: playerId,
      role: "player",
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      shirt_number: shirt_number ? parseInt(shirt_number) : null,
      is_active: true,
      team_id,
      date_of_birth: null,
      position: null,
    })
    .select()
    .single();

  if (profileError) {
    console.error("Error creating profile:", profileError);
    // Rollback: delete the auth user
    await supabase.auth.admin.deleteUser(playerId);
    return NextResponse.json(
      {
        error: "Failed to create player profile",
        details: profileError.message || JSON.stringify(profileError),
      },
      { status: 500 }
    );
  }

  // Step 3: Add player to team_members
  const { error: memberError } = await supabase.from("team_members").insert({
    team_id,
    user_id: playerId,
    role: "player",
  });

  if (memberError) {
    console.error("Error adding to team:", memberError);
    // Rollback: delete profile and auth user
    await supabase.from("profiles").delete().eq("id", playerId);
    await supabase.auth.admin.deleteUser(playerId);
    return NextResponse.json(
      {
        error: "Failed to add player to team",
        details: memberError.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(newProfile, { status: 201 });
}
