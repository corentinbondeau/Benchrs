import { NextResponse } from "next/server";
import { getAuthUserDetailed, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const { confirm } = await req.json();
  if (confirm !== "SUPPRIMER") {
    return NextResponse.json({ error: "Confirmation requise" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Suppression de l'utilisateur : profiles (ON DELETE CASCADE) entraîne la suppression
  // de toutes les données liées (team_members, notifications, ratings, etc.).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account/delete] deleteUser error:", error);
    return NextResponse.json({ error: "Impossible de supprimer le compte" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
