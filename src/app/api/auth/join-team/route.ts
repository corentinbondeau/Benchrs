import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { userId, inviteCode, role } = await req.json();

    if (!userId || !inviteCode) {
      return NextResponse.json(
        { error: "Code d'invitation requis" },
        { status: 400 }
      );
    }

    const allowedRoles = ["coach", "player", "parent"];
    if (role && !allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "Rôle invalide" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Find team by invite code
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, name, club_id")
      .eq("invite_code", inviteCode)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: "Code d'invitation invalide" },
        { status: 404 }
      );
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", team.id)
      .eq("user_id", userId)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Vous êtes déjà membre de cette équipe" },
        { status: 400 }
      );
    }

    // Determine role: explicit from join form, else fall back to profile role
    let memberRole = role || "player";
    if (!role) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      memberRole = profile?.role || "player";
    }

    // Add as team member
    const { error: memberError } = await supabase
      .from("team_members")
      .insert({ team_id: team.id, user_id: userId, role: memberRole });

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    // Update profile with team_id
    await supabase
      .from("profiles")
      .update({ team_id: team.id })
      .eq("id", userId);

    return NextResponse.json({
      team,
      message: `Vous avez rejoint l'équipe ${team.name}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
