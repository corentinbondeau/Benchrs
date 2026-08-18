import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";
import { logActivity } from "@/lib/activity";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { teamId } = await req.json();
    if (!teamId) {
      return NextResponse.json({ error: "Team ID requis" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: member } = await supabase
      .from("team_members")
      .select("id, role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member) return forbidden();

    if (member.role === "owner") {
      return NextResponse.json(
        {
          error:
            "Le propriétaire ne peut pas quitter l'équipe. Supprimez l'équipe ou transférez la propriété.",
        },
        { status: 400 }
      );
    }

    await supabase.from("team_members").delete().eq("id", member.id);
    await supabase
      .from("parent_student")
      .delete()
      .eq("team_id", teamId)
      .eq("parent_id", user.id);
    await supabase
      .from("parent_student")
      .delete()
      .eq("team_id", teamId)
      .eq("student_id", user.id);

    logActivity({
      supabase,
      teamId,
      userId: user.id,
      actionType: "roster.leave",
      description: `Départ d'un membre (${member.role})`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
