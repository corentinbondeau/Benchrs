import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultNotificationPrefs } from "@/lib/notificationTypes";

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

    // Find existing club or create new one
    let clubId: string;

    const { data: existingClub } = await supabase
      .from("clubs")
      .select("id")
      .eq("name", clubName)
      .limit(1)
      .single();

    if (existingClub) {
      clubId = existingClub.id;
    } else {
      const { data: newClub, error: clubError } = await supabase
        .from("clubs")
        .insert({ name: clubName, created_by: userId })
        .select()
        .single();

      if (clubError) {
        console.error("[create-team] club error:", clubError);
        return NextResponse.json({ error: clubError.message }, { status: 400 });
      }
      clubId = newClub.id;
    }

    // Create team
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({ club_id: clubId, name: teamName })
      .select()
      .single();

    if (teamError) {
      console.error("[create-team] team error:", teamError);
      if (teamError.code === "23505") {
        return NextResponse.json(
          { error: "Cette équipe existe déjà pour ce club" },
          { status: 409 }
        );
      }
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

    // Notifications activées par défaut pour le créateur de l'équipe
    await supabase.from("notification_preferences").upsert(
      defaultNotificationPrefs(userId, team.id),
      { onConflict: "user_id,team_id,type" }
    );

    return NextResponse.json({
      team,
      club: { id: clubId },
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
