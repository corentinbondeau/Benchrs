import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { sendPushDirect } from "@/lib/send-push-direct";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized("unauthorized");

  if (!rateLimit(`club-qualif-remind:${clientKey(req)}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { clubId, userId, qualification, expiresAt } = (body || {}) as {
    clubId?: string;
    userId?: string;
    qualification?: string;
    expiresAt?: string | null;
  };
  if (!clubId || !userId || !qualification) {
    return NextResponse.json({ error: "clubId, userId et qualification requis" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from("club_members")
    .select("id")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .eq("role", "comite")
    .maybeSingle();
  if (!membership) return forbidden();

  // La qualification doit exister dans le club et concerner ce membre.
  const { data: qualificationRow } = await supabase
    .from("staff_qualifications")
    .select("id, qualification, label, expires_at")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .eq("qualification", qualification)
    .maybeSingle();
  if (!qualificationRow) {
    return NextResponse.json({ error: "Qualification introuvable" }, { status: 404 });
  }

  const { data: club } = await supabase
    .from("clubs")
    .select("name")
    .eq("id", clubId)
    .maybeSingle();

  const now = new Date().toISOString();
  const title = "Relance diplôme";
  const label = qualificationRow.label || qualification.toUpperCase();
  const expiring = qualificationRow.expires_at ?? expiresAt ?? null;
  const bodyText = expiring
    ? `Votre diplôme « ${label} » arrive à échéance le ${new Date(expiring).toLocaleDateString("fr-FR")}. Pensez à le renouveler.`
    : `Pensez à renouveler votre diplôme « ${label} » (${club?.name ?? "club"}).`;
  const url = "/club/formations";

  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    team_id: null,
    type: "club_formation",
    title,
    body: bodyText,
    url,
    scheduled_for: now,
    delivered_at: now,
  });
  if (error) {
    console.error("[clubs/qualification-remind] insert error:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 });
  }

  try {
    await sendPushDirect(supabase, [userId], { title, body: bodyText, url });
  } catch (pushErr) {
    console.error("[clubs/qualification-remind] push error:", pushErr);
  }

  return NextResponse.json({ ok: true, sent: 1 });
}