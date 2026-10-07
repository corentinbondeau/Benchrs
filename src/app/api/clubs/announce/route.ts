import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
} from "@/lib/api-auth";
import { sendPushDirect } from "@/lib/send-push-direct";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(req: Request) {
  const auth = await getAuthUserDetailed(req);
  const user = auth.user;
  if (!user) return unauthorized(auth.reason);

  const limited = !rateLimit(`club-announce:${clientKey(req)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (limited) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });

  let body: { clubId?: string; title?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }
  const { clubId, title, message } = body;
  if (!clubId || !message?.trim()) {
    return NextResponse.json({ error: "clubId et message requis" }, { status: 400 });
  }
  if (message.trim().length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Message trop long (2000 caractères max)" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: membership } = await supabase
    .from("club_members")
    .select("id, role")
    .eq("club_id", clubId)
    .eq("user_id", user.id)
    .eq("role", "comite")
    .maybeSingle();
  if (!membership) return forbidden();

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("club_id", clubId);
  const teamIds = (teams || []).map((t) => (t as { id: string }).id);
  if (teamIds.length === 0) {
    return NextResponse.json({ error: "Aucune équipe dans ce club" }, { status: 400 });
  }

  const [{ data: members }, { data: links }] = await Promise.all([
    supabase
      .from("team_members")
      .select("user_id, team_id")
      .in("team_id", teamIds)
      .eq("role", "player"),
    supabase
      .from("parent_student")
      .select("parent_id, team_id")
      .in("team_id", teamIds),
  ]);

  const userTeams = new Map<string, string>();
  for (const m of members || []) {
    if (!userTeams.has(m.user_id)) userTeams.set(m.user_id, m.team_id);
  }
  for (const l of links || []) {
    if (!userTeams.has(l.parent_id)) userTeams.set(l.parent_id, l.team_id);
  }

  const userIds = [...userTeams.keys()];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "Aucun destinataire" }, { status: 400 });
  }

  const cleanMessage = message.trim();
  const cleanTitle = title?.trim() || "Annonce du club";
  const now = new Date().toISOString();
  const { error } = await supabase.from("notifications").insert(
    userIds.map((uid) => ({
      user_id: uid,
      team_id: userTeams.get(uid),
      type: "club_annonce",
      title: cleanTitle,
      body: cleanMessage,
      url: "/notifications",
      scheduled_for: now,
      delivered_at: now,
    }))
  );
  if (error) {
    console.error("[clubs/announce] insert error:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 });
  }

  try {
    await sendPushDirect(supabase, userIds, {
      title: cleanTitle,
      body: cleanMessage,
      url: "/notifications",
    });
  } catch (pushErr) {
    console.error("[clubs/announce] sendPushDirect error:", pushErr);
  }

  return NextResponse.json({ ok: true, sent: userIds.length });
}