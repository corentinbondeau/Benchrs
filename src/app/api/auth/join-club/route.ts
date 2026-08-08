import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

// Rejoint le comité d'un club en tant que membre (role 'comite'), depuis l'inscription.
export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return unauthorized();

    const { clubId } = await req.json();

    if (!clubId || typeof clubId !== "string") {
      return NextResponse.json(
        { error: "Club requis" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: club } = await supabase
      .from("clubs")
      .select("id, name")
      .eq("id", clubId)
      .maybeSingle();

    if (!club) {
      return NextResponse.json(
        { error: "Club introuvable" },
        { status: 404 }
      );
    }

    // Déjà membre du comité ? On ne duplique pas.
    const { data: existing } = await supabase
      .from("club_members")
      .select("id")
      .eq("club_id", clubId)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase.from("club_members").insert({
        club_id: clubId,
        user_id: authUser.id,
        role: "comite",
      });
      if (error) {
        console.error("[join-club] insert error:", error);
        return NextResponse.json(
          { error: "Erreur lors de la rejoint du club" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      club,
      message: `Vous faites partie du comité de ${club.name}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
