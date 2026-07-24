import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { userId, clubName, teamName } = await req.json();

    if (!userId || !clubName || !teamName) {
      return NextResponse.json(
        { error: "Champs obligatoires manquants" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Create club
    const { data: club, error: clubError } = await supabase
      .from("clubs")
      .insert({ name: clubName, created_by: userId })
      .select()
      .single();

    if (clubError) {
      console.error("[create-team] club error:", clubError);
      return NextResponse.json({ error: clubError.message }, { status: 400 });
    }

    // Create team
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({ club_id: club.id, name: teamName })
      .select()
      .single();

    if (teamError) {
      console.error("[create-team] team error:", teamError);
      return NextResponse.json({ error: teamError.message }, { status: 400 });
    }

    // Add user as owner
    const { error: memberError } = await supabase
      .from("team_members")
      .insert({ team_id: team.id, user_id: userId, role: "owner" });

    if (memberError) {
      console.error("[create-team] member error:", memberError);
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    // Update user profile with team_id
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ team_id: team.id })
      .eq("id", userId);

    if (profileError) {
      console.error("[create-team] profile update error:", profileError);
    }

    // Create default chat channel (non-blocking)
    const { error: channelError } = await supabase.from("chat_channels").insert({
      name: "General",
      description: "Canal général de l'équipe",
      team_id: team.id,
    });

    if (channelError) {
      console.error("[create-team] chat channel error:", channelError);
    }

    return NextResponse.json({
      team,
      club,
      inviteCode: team.invite_code,
      message: "Équipe créée avec succès",
    });
  } catch (err) {
    console.error("[create-team] unexpected error:", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
