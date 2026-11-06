import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();

  const body = await req.json();
  const { event_id, player_id } = body;

  if (!event_id || !player_id) {
    return NextResponse.json(
      { error: "Missing required fields: event_id, player_id" },
      { status: 400 }
    );
  }

  // Add attendance record for the player
  const { data: attendance, error: attendanceError } = await supabase
    .from("attendances")
    .insert({
      event_id,
      user_id: player_id,
      status: "present",
    })
    .select()
    .single();

  if (attendanceError) {
    console.error("Error creating attendance:", attendanceError);
    return NextResponse.json(
      { error: "Failed to mark player as present" },
      { status: 500 }
    );
  }

  return NextResponse.json(attendance, { status: 201 });
}
