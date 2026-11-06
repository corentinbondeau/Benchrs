import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron job pour reset les joueurs créés temporairement
 * Runs every Monday at midnight
 * Deletes all players created after the last Monday
 */
export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron (using Authorization header)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // Get current date and find the last Monday
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const daysToLastMonday = dayOfWeek === 0 ? 1 : dayOfWeek - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(lastMonday.getDate() - daysToLastMonday);
    lastMonday.setHours(0, 0, 0, 0);

    console.log(`Deleting temporary players created after: ${lastMonday.toISOString()}`);

    // Delete all profiles created after last Monday that are marked as temporary
    // For now, we delete profiles that:
    // 1. Have no email (not real users)
    // 2. Were created after last Monday
    // 3. Have role = 'player'
    const { data: deletedPlayers, error: deleteError } = await supabase
      .from("profiles")
      .delete()
      .eq("role", "player")
      .eq("email", null)
      .gte("created_at", lastMonday.toISOString());

    if (deleteError) {
      console.error("Error deleting temporary players:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete temporary players" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Reset completed: deleted players created after ${lastMonday.toISOString()}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
