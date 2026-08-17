import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultNotificationPrefs } from "@/lib/notificationTypes";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { rateLimit, AUTH_LIMIT, clientKey } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    if (!rateLimit(`auth:join-team:${clientKey(req)}`, AUTH_LIMIT)) {
      return NextResponse.json(
        { error: "Trop de tentatives, réessayez dans une minute" },
        { status: 429 }
      );
    }
    const authUser = await getAuthUser(req);
    if (!authUser) return unauthorized();

    const { inviteCode, role } = await req.json();

    if (!inviteCode) {
      return NextResponse.json(
        { error: "Code d'invitation requis" },
        { status: 400 }
      );
    }

    // Les rôles autorisés: player, parent, coach
    // Owner ne peut être attribué que lors de la création de l'équipe
    const allowedRoles = ["player", "parent", "coach"];
    const memberRole = allowedRoles.includes(role) ? role : "player";

    const userId = authUser.id;
    const supabase = createAdminClient();

    // Find team by invite code
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, name, club_id")
      .eq("invite_code", String(inviteCode).trim())
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

    // Add as team member (role limité à player/parent ci-dessus)
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

    // Notifications activées par défaut pour la nouvelle équipe
    await supabase.from("notification_preferences").upsert(
      defaultNotificationPrefs(userId, team.id),
      { onConflict: "user_id,team_id,type" }
    );

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
