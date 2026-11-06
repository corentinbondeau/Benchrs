import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Create a temporary player for a team
 * 
 * Note: Created players (with no email) are automatically deleted every Monday
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

  // Create a profile entry for the new player
  const { data: newProfile, error: profileError } = await supabase
    .from("profiles")
    .insert({
      email: null,
      phone_number: null,
      date_of_birth: null,
      position: null,
      first_name,
      last_name,
      shirt_number: shirt_number ? parseInt(shirt_number) : null,
      role: "player",
      avatar_url: null,
      phone: null,
      is_active: true,
      team_id,
      vma: null,
      vmi: null,
      licence_expires_at: null,
      medical_cert_expires_at: null,
    })
    .select()
    .single();

  if (profileError) {
    console.error("Error creating profile:", profileError);
    return NextResponse.json(
      { error: "Failed to create player" },
      { status: 500 }
    );
  }

  return NextResponse.json(newProfile, { status: 201 });
}
