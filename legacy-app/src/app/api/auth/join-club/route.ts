import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { rateLimit, AUTH_LIMIT, clientKey } from "@/lib/rateLimit";

// Rejoint le comité d'un club en tant que membre (role 'comite').
// Sécurisé par un code d'invitation généré par le club (comite_invite_code) :
// un utilisateur quelconque ne peut plus s'auto-inscrire au comité d'un club.
export async function POST(req: Request) {
  try {
    if (!rateLimit(`auth:join-club:${clientKey(req)}`, AUTH_LIMIT)) {
      return NextResponse.json(
        { error: "Trop de tentatives, réessayez dans une minute" },
        { status: 429 }
      );
    }
    const authUser = await getAuthUser(req);
    if (!authUser) return unauthorized();

    const { clubId, inviteCode } = await req.json();

    if (!clubId || typeof clubId !== "string") {
      return NextResponse.json(
        { error: "Club requis" },
        { status: 400 }
      );
    }

    if (typeof inviteCode !== "string" || !inviteCode.trim()) {
      return NextResponse.json(
        { error: "Code d'invitation requis. Demandez-le au président du club." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: club } = await supabase
      .from("clubs")
      .select("id, name, comite_invite_code")
      .eq("id", clubId)
      .maybeSingle();

    if (!club) {
      return NextResponse.json(
        { error: "Club introuvable" },
        { status: 404 }
      );
    }

    if (!club.comite_invite_code || club.comite_invite_code !== inviteCode.trim()) {
      return NextResponse.json(
        { error: "Code d'invitation invalide. Demandez-le au président du club." },
        { status: 403 }
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
