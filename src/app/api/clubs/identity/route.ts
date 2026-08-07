import { NextResponse } from "next/server";
import { getAuthUserDetailed, unauthorized, forbidden } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeClubName, normalizeFffNumber } from "@/lib/clubs";

// Identité d'un club : définition / mise à jour du numéro d'affiliation FFF.
// Réservé au président (ou créateur) du club. Un numéro déjà pris par un autre
// club est refusé (409) — c'est la clé canonique qui empêche les doublons.
export async function POST(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId : "";
  const fff = normalizeFffNumber(String(body?.fffNumber ?? ""));

  if (!clubId) {
    return NextResponse.json({ error: "clubId requis" }, { status: 400 });
  }
  if (!fff) {
    return NextResponse.json(
      { error: "Numéro d'affiliation FFF invalide (6 chiffres requis)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: club } = await admin
    .from("clubs")
    .select("id, name, created_by")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });

  const { data: isPresident } = await admin
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .eq("role", "president")
    .maybeSingle();
  if (!isPresident && club.created_by !== user.id) return forbidden();

  // Le numéro appartient déjà à un autre club ?
  const { data: owner } = await admin
    .from("clubs")
    .select("id, name")
    .eq("fff_number", fff)
    .neq("id", clubId)
    .maybeSingle();
  if (owner) {
    return NextResponse.json(
      {
        error: `Ce numéro appartient déjà au club ${owner.name}. Vérifiez le numéro ou rapprochez-vous de l'autre club.`,
        existingClub: owner,
      },
      { status: 409 }
    );
  }

  const { error } = await admin
    .from("clubs")
    .update({ fff_number: fff, name_normalized: normalizeClubName(club?.name ?? "") })
    .eq("id", clubId);
  if (error) {
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fff_number: fff });
}
