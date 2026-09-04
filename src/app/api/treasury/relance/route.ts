import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
  isTeamCoach,
} from "@/lib/api-auth";
import { sendPushDirect } from "@/lib/send-push-direct";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await getAuthUserDetailed(req);
  const user = auth.user;
  if (!user) return unauthorized(auth.reason);

  let body: { teamId?: string; cotisationId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }
  const { teamId, cotisationId } = body;
  if (!teamId || !cotisationId) {
    return NextResponse.json({ error: "teamId et cotisationId requis" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!(await isTeamCoach(user.id, teamId))) {
    return forbidden();
  }

  const { data: cotisation } = await supabase
    .from("cotisations")
    .select("id, player_id, season, amount_expected, amount_paid")
    .eq("id", cotisationId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (!cotisation) {
    return NextResponse.json({ error: "Cotisation introuvable" }, { status: 404 });
  }

  const remaining = Math.max(0, Number(cotisation.amount_expected) - Number(cotisation.amount_paid));
  if (remaining <= 0) {
    return NextResponse.json({ error: "Cette cotisation est déjà réglée" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("id", cotisation.player_id)
    .maybeSingle();

  const { data: links } = await supabase
    .from("parent_student")
    .select("parent_id")
    .eq("team_id", teamId)
    .eq("student_id", cotisation.player_id);
  const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
  const userIds = [...new Set([cotisation.player_id, ...parentIds])];

  const playerName = profile ? `${profile.first_name} ${profile.last_name}` : "un joueur";
  const now = new Date().toISOString();
  const notifBody = `Le solde de la cotisation de ${playerName} (saison ${cotisation.season}) s'élève à ${remaining.toFixed(2)} €. Pensez à régulariser.`;
  const { error } = await supabase.from("notifications").insert(
    userIds.map((uid: string) => ({
      user_id: uid,
      team_id: teamId,
      type: "relance",
      title: "Relance cotisation",
      body: notifBody,
      reference_id: `relance:${cotisation.id}`,
      url: "/admin/treasury",
      scheduled_for: now,
      // Marquer delivered_at à l'insertion : le push est envoyé directement
      // (pas de passage par le cron). Évite un UPDATE séparé.
      delivered_at: now,
    }))
  );
  if (error) {
    console.error("[treasury/relance] insert error:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi" }, { status: 500 });
  }

  // Envoyer le push directement aux destinataires (sans passer par le cron)
  try {
    await sendPushDirect(supabase, userIds, {
      title: "Relance cotisation",
      body: notifBody,
      url: "/admin/treasury",
    });
  } catch (pushErr) {
    console.error("[treasury/relance] sendPushDirect error:", pushErr);
  }

  return NextResponse.json({ ok: true, sent: userIds.length });
}
