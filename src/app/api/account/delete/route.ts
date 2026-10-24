import { NextResponse } from "next/server";
import { getAuthUserDetailed, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, AUTH_LIMIT, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!rateLimit(`account:delete:${clientKey(req)}`, AUTH_LIMIT)) {
    return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
  }

  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  if (body.confirm !== "SUPPRIMER") {
    return NextResponse.json({ error: "Confirmation requise" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Journaliser la demande avant suppression
  try {
    await admin.from("rgpd_audit_logs").insert({
      user_id: user.id,
      actor_id: user.id,
      action: "account_deletion_requested",
      details: { email: user.email },
    });
  } catch {}

  // Supprimer les données orphelines critiques avant de supprimer l'utilisateur
  try {
    await Promise.allSettled([
      admin.from("push_subscriptions").delete().eq("user_id", user.id),
      admin.from("notification_preferences").delete().eq("user_id", user.id),
      admin.from("chat_members").delete().eq("user_id", user.id),
      admin.from("parent_student").delete().or(`parent_id.eq.${user.id},student_id.eq.${user.id}`),
      admin.from("team_members").delete().eq("user_id", user.id),
    ]);
  } catch {}

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account/delete] deleteUser error:", error);
    return NextResponse.json({ error: "Impossible de supprimer le compte" }, { status: 500 });
  }

  try {
    await admin.from("rgpd_audit_logs").insert({
      user_id: null,
      actor_id: null,
      action: "account_deleted",
      details: { user_id: user.id },
    });
  } catch {}

  return NextResponse.json({ ok: true });
}
