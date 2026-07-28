import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { teamId } = await req.json();
    if (!teamId) {
      return NextResponse.json({ error: "Team ID required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const tables = [
      "chat_messages",
      "chat_members",
      "chat_channels",
      "match_ratings",
      "match_events",
      "match_lineups",
      "match_stats",
      "attendances",
      "events",
      "training_sessions",
      "formations",
      "fitness_ratings",
      "injuries",
      "carpooling_bookings",
      "carpooling_trips",
      "tasks",
      "motm_votes",
      "trophies",
      "gallery_media",
      "notifications",
      "push_subscriptions",
      "licences",
      "cotisations",
      "parent_student",
      "championships",
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("team_id", teamId);
      if (error) {
        return NextResponse.json({ error: `Erreur lors de la suppression dans ${table}: ${error.message}` }, { status: 500 });
      }
    }

    const { error: tmErr } = await supabase.from("team_members").delete().eq("team_id", teamId);
    if (tmErr) {
      return NextResponse.json({ error: `Erreur lors de la suppression des membres: ${tmErr.message}` }, { status: 500 });
    }

    const { error: profErr } = await supabase.from("profiles").update({ team_id: null }).eq("team_id", teamId);
    if (profErr) {
      return NextResponse.json({ error: `Erreur lors de la mise à jour des profils: ${profErr.message}` }, { status: 500 });
    }

    const { error: teamErr } = await supabase.from("teams").delete().eq("id", teamId);
    if (teamErr) {
      return NextResponse.json({ error: `Erreur lors de la suppression de l'équipe: ${teamErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}