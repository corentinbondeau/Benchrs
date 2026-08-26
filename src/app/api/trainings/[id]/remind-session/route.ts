import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUserDetailed, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import {
  computeMissingResponders,
  type AttendanceRow,
  type RpeRow,
  type FeedbackRow,
} from "@/lib/session-reminders";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { user, reason } = await getAuthUserDetailed(req);
  if (!user) return unauthorized(reason);

  const supabase = createAdminClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, team_id, type, event_date")
    .eq("id", id)
    .maybeSingle();

  const eventRow = event as { id: string; team_id: string | null; type: string; event_date: string } | null;

  if (!eventRow || !eventRow.team_id) {
    return NextResponse.json({ error: "Entraînement introuvable" }, { status: 404 });
  }

  const authorized = await isTeamCoach(user.id, eventRow.team_id);
  if (!authorized) return forbidden();

  const { data: attendancesData } = await supabase
    .from("attendances")
    .select("user_id, status")
    .eq("event_id", eventRow.id)
    .in("status", ["present", "late"]);

  const attendances = (attendancesData || []) as AttendanceRow[];

  const { data: rpeData } = await supabase
    .from("session_rpe")
    .select("player_id, rpe")
    .eq("event_id", eventRow.id);

  const { data: feedbackData } = await supabase
    .from("session_feedback")
    .select("player_id, rating")
    .eq("event_id", eventRow.id);

  const candidateIds = [...new Set(attendances.map((a) => a.user_id))];

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id")
    .in("id", candidateIds)
    .eq("is_active", true);

  const activePlayerIds = ((profilesData || []) as { id: string }[]).map((p) => p.id);

  const missing = computeMissingResponders({
    attendances,
    rpeRows: (rpeData || []) as RpeRow[],
    feedbackRows: (feedbackData || []) as FeedbackRow[],
    activePlayerIds,
  });

  if (missing.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  const missingIds = missing.map((m) => m.userId);

  const { data: parentLinksData } = await supabase
    .from("parent_student")
    .select("parent_id, student_id")
    .eq("team_id", eventRow.team_id)
    .in("student_id", missingIds);

  const parentsByStudent = new Map<string, string[]>();
  for (const link of (parentLinksData || []) as { parent_id: string; student_id: string }[]) {
    const list = parentsByStudent.get(link.student_id) || [];
    list.push(link.parent_id);
    parentsByStudent.set(link.student_id, list);
  }

  const recipientIds = new Set<string>();
  for (const m of missing) {
    recipientIds.add(m.userId);
    for (const parentId of parentsByStudent.get(m.userId) || []) {
      recipientIds.add(parentId);
    }
  }

  const refIds = [...recipientIds].map((uid) => `seance-relance:${eventRow.id}:${uid}`);

  const { data: existingData } = await supabase
    .from("notifications")
    .select("reference_id")
    .eq("type", "relance_seance")
    .in("reference_id", refIds);

  const existingRefs = new Set(
    ((existingData || []) as { reference_id: string }[]).map((n) => n.reference_id)
  );

  const now = new Date().toISOString();
  const rows = [...recipientIds]
    .map((uid) => ({
      user_id: uid,
      team_id: eventRow.team_id,
      type: "relance_seance",
      title: "Analyse de séance à compléter",
      body: "Merci de renseigner ton RPE et/ou ton analyse de séance pour l'entraînement passé.",
      reference_id: `seance-relance:${eventRow.id}:${uid}`,
      url: `/trainings/${eventRow.id}`,
      scheduled_for: now,
    }))
    .filter((row) => !existingRefs.has(row.reference_id));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, reminded: 0 });
  }

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    console.error("[remind-session] insert error:", error);
    return NextResponse.json({ error: "Erreur lors de l'envoi des relances" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reminded: rows.length });
}
