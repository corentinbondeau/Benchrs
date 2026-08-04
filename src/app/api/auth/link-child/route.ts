import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return unauthorized();

    const { studentIds, teamId } = await req.json();

    if (
      !teamId ||
      typeof teamId !== "string" ||
      !Array.isArray(studentIds) ||
      studentIds.length === 0
    ) {
      return NextResponse.json(
        { error: "Paramètres manquants" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: parentMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", authUser.id)
      .eq("team_id", teamId)
      .maybeSingle();

    if (!parentMember) {
      return NextResponse.json(
        { error: "Vous n'êtes pas membre de cette équipe" },
        { status: 403 }
      );
    }

    const { data: students } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("role", "player")
      .in("user_id", studentIds);

    const validIds = new Set((students || []).map((s) => s.user_id as string));
    const invalid = studentIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Certains joueurs ne font pas partie de l'équipe" },
        { status: 400 }
      );
    }

    const rows = studentIds.map((studentId) => ({
      parent_id: authUser.id,
      student_id: studentId,
      team_id: teamId,
    }));

    const { error } = await supabase
      .from("parent_student")
      .upsert(rows, { onConflict: "parent_id,student_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, linked: rows.length });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
