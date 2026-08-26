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
  try {
    const { id } = await params;

    const { user, reason } = await getAuthUserDetailed(req);
    if (!user) return unauthorized(reason);

    const supabase = createAdminClient();

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, team_id, type, event_date")
      .eq("id", id)
      .maybeSingle();

    if (eventError) {
      console.error("[remind-session] events error:", eventError);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "events", detail: eventError.message },
        { status: 500 }
      );
    }

    const eventRow = event as { id: string; team_id: string | null; type: string; event_date: string } | null;

    if (!eventRow || !eventRow.team_id) {
      return NextResponse.json({ error: "Entraînement introuvable" }, { status: 404 });
    }

    const authorized = await isTeamCoach(user.id, eventRow.team_id);
    if (!authorized) return forbidden();

    const { data: attendancesData, error: attendancesError } = await supabase
      .from("attendances")
      .select("user_id, status")
      .eq("event_id", eventRow.id)
      .in("status", ["present", "late"]);

    if (attendancesError) {
      console.error("[remind-session] attendances error:", attendancesError);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "attendances", detail: attendancesError.message },
        { status: 500 }
      );
    }

    const attendances = (attendancesData || []) as AttendanceRow[];

    const { data: rpeData, error: rpeError } = await supabase
      .from("session_rpe")
      .select("player_id, rpe")
      .eq("event_id", eventRow.id);

    if (rpeError) {
      console.error("[remind-session] session_rpe error:", rpeError);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "session_rpe", detail: rpeError.message },
        { status: 500 }
      );
    }

    const { data: feedbackData, error: feedbackError } = await supabase
      .from("session_feedback")
      .select("player_id, rating")
      .eq("event_id", eventRow.id);

    if (feedbackError) {
      console.error("[remind-session] session_feedback error:", feedbackError);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "session_feedback", detail: feedbackError.message },
        { status: 500 }
      );
    }

    const candidateIds = [...new Set(attendances.map((a) => a.user_id))];

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id")
      .in("id", candidateIds)
      .eq("is_active", true);

    if (profilesError) {
      console.error("[remind-session] profiles error:", profilesError);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "profiles", detail: profilesError.message },
        { status: 500 }
      );
    }

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

    const { data: parentLinksData, error: parentLinksError } = await supabase
      .from("parent_student")
      .select("parent_id, student_id")
      .eq("team_id", eventRow.team_id)
      .in("student_id", missingIds);

    if (parentLinksError) {
      console.error("[remind-session] parent_student error:", parentLinksError);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "parent_student", detail: parentLinksError.message },
        { status: 500 }
      );
    }

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

    const { data: existingData, error: existingError } = await supabase
      .from("notifications")
      .select("reference_id")
      .eq("type", "relance_seance")
      .in("reference_id", refIds);

    if (existingError) {
      console.error("[remind-session] notifications error:", existingError);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "notifications", detail: existingError.message },
        { status: 500 }
      );
    }

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
      console.error("[remind-session] notifications error:", error);
      return NextResponse.json(
        { error: "Erreur lors de l'envoi des relances", step: "notifications", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, reminded: rows.length });
  } catch (err) {
    console.error("[remind-session] unhandled:", err);
    return NextResponse.json(
      { error: "Erreur interne", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
