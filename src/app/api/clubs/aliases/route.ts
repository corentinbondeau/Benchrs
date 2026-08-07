import { NextResponse } from "next/server";
import { getAuthUserDetailed, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Gestion des alias de club (variantes d'écriture du nom : "ECC", "Etoile Camphin" ...).
// Réservé au président (ou créateur) du club.
async function assertPresident(userId: string, admin: ReturnType<typeof createAdminClient>, clubId: string) {
  const { data: club } = await admin
    .from("clubs")
    .select("id, created_by")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return { error: "Club introuvable", status: 404 };
  const { data: isPresident } = await admin
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("role", "president")
    .maybeSingle();
  if (!isPresident && club.created_by !== userId) return { error: "Accès refusé", status: 403 };
  return null;
}

export async function POST(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId : "";
  const alias = typeof body?.alias === "string" ? body.alias.trim() : "";

  if (!clubId || !alias || alias.length > 60) {
    return NextResponse.json({ error: "clubId et alias requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const denied = await assertPresident(user.id, admin, clubId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { error } = await admin
    .from("club_aliases")
    .insert({ club_id: clubId, alias, created_by: user.id });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Cet alias existe déjà" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur lors de l'ajout" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId : "";
  const alias = typeof body?.alias === "string" ? body.alias.trim() : "";

  if (!clubId || !alias) {
    return NextResponse.json({ error: "clubId et alias requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const denied = await assertPresident(user.id, admin, clubId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const { error } = await admin
    .from("club_aliases")
    .delete()
    .eq("club_id", clubId)
    .eq("alias", alias);
  if (error) {
    return NextResponse.json({ error: "Erreur lors de la suppression" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
