import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  // Verify this is a cron request
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find matches completed in last 48 hours
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: recentMatches } = await supabase
    .from("events")
    .select("id, title")
    .eq("type", "match")
    .eq("status", "completed")
    .gte("updated_at", twoDaysAgo);

  if (!recentMatches || recentMatches.length === 0) {
    return NextResponse.json({ message: "No recent matches" });
  }

  // Get all active players and parents
  const { data: members } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["player", "parent"])
    .eq("is_active", true);

  if (!members || members.length === 0) {
    return NextResponse.json({ message: "No members" });
  }

  let notificationsCreated = 0;

  for (const match of recentMatches) {
    // Check if notifications already sent for this match
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "motm_vote")
      .eq("reference_id", match.id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Create notifications for all members
    const notifications = members.map((m) => ({
      user_id: m.id,
      title: "Vote Homme du Match",
      body: `Qui est l'Homme du Match pour "${match.title}" ?`,
      type: "motm_vote",
      reference_id: match.id,
    }));

    const { error } = await supabase.from("notifications").insert(notifications);
    if (!error) {
      notificationsCreated += notifications.length;
    }
  }

  return NextResponse.json({
    message: "MOTM notifications sent",
    matches: recentMatches.length,
    notifications: notificationsCreated,
  });
}
