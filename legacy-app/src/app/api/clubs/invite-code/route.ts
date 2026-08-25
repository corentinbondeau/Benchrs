import { NextResponse } from "next/server";
import { getAuthUserDetailed, forbidden, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function isClubPresident(userId: string, clubId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("role", "president")
    .maybeSingle();
  if (data) return true;
  const { data: club } = await admin
    .from("clubs")
    .select("id")
    .eq("id", clubId)
    .eq("created_by", userId)
    .maybeSingle();
  return !!club;
}

function makeCode(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

// POST /api/clubs/invite-code  { clubId, regenerate?: boolean }
// Réservé au président/créateur du club. Renvoie le code d'invitation comité
// (le régénère si regenerate=true, invalidant les anciens liens).
export async function POST(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId : "";
  const regenerate = body?.regenerate === true;

  if (!clubId) {
    return NextResponse.json({ error: "clubId requis" }, { status: 400 });
  }
  if (!(await isClubPresident(user.id, clubId))) return forbidden();

  const admin = createAdminClient();

  const { data: club, error } = await admin
    .from("clubs")
    .select("comite_invite_code")
    .eq("id", clubId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
  if (!club) {
    return NextResponse.json({ error: "Club introuvable" }, { status: 404 });
  }

  let inviteCode = club.comite_invite_code;
  if (!inviteCode) inviteCode = makeCode();

  if (regenerate || !club.comite_invite_code) {
    const { error: updErr } = await admin
      .from("clubs")
      .update({ comite_invite_code: inviteCode })
      .eq("id", clubId);
    if (updErr) {
      return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
    }
  }

  return NextResponse.json({ inviteCode });
}
