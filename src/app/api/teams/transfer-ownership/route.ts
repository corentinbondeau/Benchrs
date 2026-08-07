import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { teamId, newOwnerId } = await req.json();
    if (!teamId || !newOwnerId) {
      return NextResponse.json({ error: "teamId et newOwnerId requis" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: member } = await supabase
      .from("team_members")
      .select("id, role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || member.role !== "owner") {
      return forbidden();
    }

    if (newOwnerId === user.id) {
      return NextResponse.json(
        { error: "Vous êtes déjà le propriétaire de cette équipe" },
        { status: 400 }
      );
    }

    const { data: target } = await supabase
      .from("team_members")
      .select("id, role")
      .eq("team_id", teamId)
      .eq("user_id", newOwnerId)
      .maybeSingle();

    if (!target) {
      return NextResponse.json(
        { error: "Ce membre n'appartient pas à l'équipe" },
        { status: 404 }
      );
    }
    if (target.role === "owner") {
      return NextResponse.json(
        { error: "Ce membre est déjà propriétaire" },
        { status: 400 }
      );
    }

    const { error: promoteErr } = await supabase
      .from("team_members")
      .update({ role: "owner" })
      .eq("id", target.id);
    if (promoteErr) {
      return NextResponse.json(
        { error: `Erreur lors du transfert: ${promoteErr.message}` },
        { status: 500 }
      );
    }

    const { error: demoteErr } = await supabase
      .from("team_members")
      .update({ role: "coach" })
      .eq("id", member.id);
    if (demoteErr) {
      return NextResponse.json(
        { error: `Erreur lors du transfert: ${demoteErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
