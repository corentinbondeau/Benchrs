import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { sendPushDirect } from "@/lib/send-push-direct";

export const dynamic = "force-dynamic";

const MAX_CONTENT = 8000;

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized("unauthorized");

  if (!rateLimit(`club-newsletter:${clientKey(req)}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { clubId, title, content, audience, teamId, scheduledFor } = (body || {}) as {
    clubId?: string;
    title?: string;
    content?: string;
    audience?: string;
    teamId?: string | null;
    scheduledFor?: string | null;
  };
  const cleanTitle = title?.trim();
  const cleanContent = content?.trim();
  if (!clubId || !cleanTitle || !cleanContent) {
    return NextResponse.json({ error: "clubId, title et content requis" }, { status: 400 });
  }
  if (cleanContent.length > MAX_CONTENT) {
    return NextResponse.json({ error: "Contenu trop long (8000 caractères max)" }, { status: 400 });
  }
  if (audience !== "all" && audience !== "team") {
    return NextResponse.json({ error: "Audience invalide" }, { status: 400 });
  }
  if (audience === "team" && !teamId) {
    return NextResponse.json({ error: "teamId requis pour une cible équipe" }, { status: 400 });
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

  // Cible : équipes du club (ou l'équipe choisie), puis joueurs + parents.
  const targetTeamIds =
    audience === "team"
      ? [teamId as string]
      : ((await supabase.from("teams").select("id").eq("club_id", clubId)).data || []).map(
          (t) => (t as { id: string }).id
        );
  if (audience === "team") {
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId as string)
      .eq("club_id", clubId)
      .maybeSingle();
    if (!team) return NextResponse.json({ error: "Équipe inconnue du club" }, { status: 400 });
  }

  const [{ data: members }, { data: links }] = await Promise.all([
    supabase
      .from("team_members")
      .select("user_id, team_id")
      .in("team_id", targetTeamIds)
      .eq("role", "player"),
    supabase
      .from("parent_student")
      .select("parent_id, team_id")
      .in("team_id", targetTeamIds),
  ]);

  const userTeams = new Map<string, string>();
  for (const m of members || []) {
    if (!userTeams.has(m.user_id)) userTeams.set(m.user_id, m.team_id);
  }
  for (const l of links || []) {
    if (!userTeams.has(l.parent_id)) userTeams.set(l.parent_id, l.team_id);
  }

  const now = new Date().toISOString();
  const isImmediate = !scheduledFor || scheduledFor <= now;

  const { data: newsletter, error: insertErr } = await supabase
    .from("club_newsletters")
    .insert({
      club_id: clubId,
      title: cleanTitle,
      content: cleanContent,
      audience: audience as "all" | "team",
      team_id: audience === "team" ? teamId : null,
      status: isImmediate ? "sent" : "scheduled",
      scheduled_for: scheduledFor || now,
      sent_at: isImmediate ? now : null,
      created_by: user.id,
    })
    .select("id, status")
    .maybeSingle();
  if (insertErr) {
    console.error("[clubs/newsletter] insert error:", insertErr);
    return NextResponse.json({ error: "Erreur lors de la création" }, { status: 500 });
  }

  if (userTeams.size > 0) {
    // Notifications : différé (cron délivre, delivered_at NULL) ou immédiat.
    const { error: notifErr } = await supabase.from("notifications").insert(
      [...userTeams.entries()].map(([uid, tid]) => ({
        user_id: uid,
        team_id: tid,
        type: "club_newsletter",
        title: cleanTitle,
        body: cleanContent,
        url: "/notifications",
        scheduled_for: scheduledFor || now,
        delivered_at: isImmediate ? now : null,
      }))
    );
    if (notifErr) console.error("[clubs/newsletter] notif error:", notifErr);

    if (isImmediate) {
      try {
        await sendPushDirect(supabase, [...userTeams.keys()], {
          title: cleanTitle,
          body: cleanContent,
          url: "/notifications",
        });
      } catch (pushErr) {
        console.error("[clubs/newsletter] push error:", pushErr);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    newsletter: {
      id: (newsletter as { id: string } | null)?.id ?? null,
      status: (newsletter as { status: string } | null)?.status ?? "scheduled",
    },
  });
}