import { NextResponse } from "next/server";
import { getAuthUserDetailed, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, AUTH_LIMIT, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["cgu", "privacy", "data_processing", "health_data", "parental", "marketing"]);

export async function POST(req: Request) {
  if (!rateLimit(`account:consent:${clientKey(req)}`, AUTH_LIMIT)) {
    return NextResponse.json({ error: "Trop de tentatives" }, { status: 429 });
  }

  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  let body: { consents?: Array<{ type: string; granted: boolean }> } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const consents = Array.isArray(body.consents) ? body.consents : [];
  const admin = createAdminClient();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || null;
  const ua = req.headers.get("user-agent") || null;

  for (const c of consents) {
    if (!ALLOWED.has(c.type)) continue;
    const now = new Date().toISOString();
    await admin.from("user_consents").upsert({
      user_id: user.id,
      consent_type: c.type,
      granted: !!c.granted,
      granted_at: c.granted ? now : null,
      revoked_at: c.granted ? null : now,
      ip_address: ip,
      user_agent: ua,
      updated_at: now,
    }, { onConflict: "user_id,consent_type" });

    try {
      await admin.from("rgpd_audit_logs").insert({
        user_id: user.id,
        actor_id: user.id,
        action: c.granted ? "consent_granted" : "consent_revoked",
        details: { consent_type: c.type },
        ip_address: ip,
        user_agent: ua,
      });
    } catch {}
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const admin = createAdminClient();
  const { data } = await admin.from("user_consents").select("*").eq("user_id", user.id);
  return NextResponse.json({ consents: data || [] });
}
