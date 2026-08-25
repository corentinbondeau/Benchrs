import { NextResponse } from "next/server";
import { getAuthUserDetailed, forbidden, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

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

async function findUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  let page = 0;
  while (page < 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page: page + 1, perPage: 1000 });
    if (error) return null;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === normalized
    );
    if (match) return match.id;
    if (data.users.length < 1000) break;
    page++;
  }
  return null;
}

export async function POST(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = body?.role === "president" ? "president" : "comite";

  if (!clubId || !email) {
    return NextResponse.json({ error: "clubId et email requis" }, { status: 400 });
  }
  if (!(await isClubPresident(user.id, clubId))) return forbidden();

  const admin = createAdminClient();

  const { data: club } = await admin
    .from("clubs")
    .select("id")
    .eq("id", clubId)
    .maybeSingle();
  if (!club) return NextResponse.json({ error: "Club introuvable" }, { status: 404 });

  const targetId = await findUserIdByEmail(admin, email);
  if (!targetId) {
    return NextResponse.json(
      { error: "Aucun compte trouvé pour cet email" },
      { status: 404 }
    );
  }

  const { data: existing } = await admin
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", targetId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "Déjà membre du comité" }, { status: 400 });
  }

  const { error } = await admin
    .from("club_members")
    .insert({ club_id: clubId, user_id: targetId, role });
  if (error) {
    return NextResponse.json({ error: "Erreur lors de l'ajout" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";

  if (!clubId || !userId) {
    return NextResponse.json({ error: "clubId et userId requis" }, { status: 400 });
  }
  if (!(await isClubPresident(user.id, clubId))) return forbidden();
  if (userId === user.id) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous retirer vous-même" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("club_members")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Erreur lors du retrait" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const body = await req.json().catch(() => null);
  const clubId = typeof body?.clubId === "string" ? body.clubId : "";
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const role = body?.role === "president" ? "president" : "comite";

  if (!clubId || !userId) {
    return NextResponse.json({ error: "clubId et userId requis" }, { status: 400 });
  }
  if (!(await isClubPresident(user.id, clubId))) return forbidden();
  if (userId === user.id) {
    return NextResponse.json({ error: "Vous ne pouvez pas changer votre propre rôle" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("club_members")
    .update({ role })
    .eq("club_id", clubId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: "Erreur lors du changement de rôle" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
