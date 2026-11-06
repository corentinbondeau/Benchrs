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

  // Generate a unique ID for the temporary player
  const playerId = `temp-${crypto.randomUUID()}`;

  // Create a profile entry for the new player (minimal fields)
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
    return NextResponse.json(
      { 
        error: "Failed to create player",
        details: profileError.message || JSON.stringify(profileError)
      },
      { status: 500 }
    );
  }

  return NextResponse.json(newProfile, { status: 201 });
}
