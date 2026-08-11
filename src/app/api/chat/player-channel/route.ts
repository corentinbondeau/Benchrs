import { NextResponse } from "next/server";
import { getAuthUser, isTeamMember } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const teamId = body?.teamId as string | undefined;
  const playerId = body?.playerId as string | undefined;
  if (!teamId || !playerId) {
    return NextResponse.json({ error: "teamId et playerId requis" }, { status: 400 });
  }

  if (!(await isTeamMember(user.id, teamId))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Le demandeur doit être coach/owner de l'équipe OU parent de CE joueur
  const [{ data: callerRole }, { data: callerLink }] = await Promise.all([
    admin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("parent_student")
      .select("id")
      .eq("team_id", teamId)
      .eq("student_id", playerId)
      .eq("parent_id", user.id)
      .maybeSingle(),
  ]);
  const isCoach =
    callerRole && (callerRole.role === "coach" || callerRole.role === "owner");
  if (!isCoach && !callerLink) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Le joueur doit être membre de l'équipe avec le rôle player
  const { data: playerMember } = await admin
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", teamId)
    .eq("user_id", playerId)
    .maybeSingle();
  if (!playerMember || playerMember.role !== "player") {
    return NextResponse.json({ error: "Joueur invalide" }, { status: 400 });
  }

  // Canal existant ? (unique par team_id + player_id)
  const { data: existing } = await admin
    .from("chat_channels")
    .select("*")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .maybeSingle();

  let channel = existing as { id: string; name: string } | null;

  if (!channel) {
    const { data: playerProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", playerId)
      .maybeSingle();
    const { data: created, error } = await admin
      .from("chat_channels")
      .insert({
        team_id: teamId,
        player_id: playerId,
        channel_type: "player",
        is_private: true,
        is_default: false,
        created_by: null,
        name: playerProfile
          ? `${playerProfile.first_name} ${playerProfile.last_name}`
          : "Joueur",
      })
      .select()
      .single();
    if (error || !created) {
      console.error("[chat/player-channel] création échouée:", error);
      return NextResponse.json(
        { error: "Erreur lors de la création du canal" },
        { status: 500 }
      );
    }
    channel = created as { id: string; name: string };
  }

  // Membres : coachs/owners de l'équipe + parents du joueur
  const [{ data: coaches }, { data: links }] = await Promise.all([
    admin
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["coach", "owner"]),
    admin
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .eq("student_id", playerId),
  ]);

  const userIds = [
    ...new Set([
      ...((coaches || []) as { user_id: string }[]).map((m) => m.user_id),
      ...((links || []) as { parent_id: string }[]).map((l) => l.parent_id),
    ]),
  ];

  if (userIds.length > 0) {
    await admin.from("chat_members").upsert(
      userIds.map((uid) => ({
        channel_id: channel!.id,
        user_id: uid,
        team_id: teamId,
      })),
      { onConflict: "channel_id,user_id" }
    );
  }

  return NextResponse.json({ channel });
}
