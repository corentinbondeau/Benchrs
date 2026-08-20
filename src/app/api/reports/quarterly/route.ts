import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthUserDetailed,
  unauthorized,
  forbidden,
  isTeamMember,
  isTeamCoach,
} from "@/lib/api-auth";
import { generateQuarterlyReports } from "@/lib/quarterlyReport";
import { quarterDateRange, currentQuarterKey, quarterLabel } from "@/lib/goals";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await getAuthUserDetailed(req);
  const user = auth.user;
  if (!user) return unauthorized(auth.reason);

  let body: { teamId?: string; quarter?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }
  const { teamId } = body;
  const quarter = body.quarter || currentQuarterKey();
  if (!teamId) {
    return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  }
  const range = quarterDateRange(quarter);
  if (!range) {
    return NextResponse.json({ error: "Trimestre invalide" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!(await isTeamMember(user.id, teamId))) return forbidden();
  if (!(await isTeamCoach(user.id, teamId))) {
    return NextResponse.json({ error: "Seuls les coachs peuvent générer les bilans" }, { status: 403 });
  }

  // Mode manuel : le coach rédige le bilan d'un joueur à la main
  if (body.mode === "manual") {
    const { playerId, report } = body as {
      playerId?: string;
      report?: { title?: string; progression?: string; assiduite?: string; comportement?: string; axes?: unknown };
    };
    if (!playerId || typeof playerId !== "string") {
      return NextResponse.json({ error: "playerId requis" }, { status: 400 });
    }
    const { data: playerMember } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .eq("user_id", playerId)
      .eq("role", "player")
      .maybeSingle();
    if (!playerMember) {
      return NextResponse.json(
        { error: "Ce joueur ne fait pas partie de l'équipe" },
        { status: 400 }
      );
    }
    if (!report || typeof report !== "object") {
      return NextResponse.json({ error: "report manquant" }, { status: 400 });
    }
    const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 1200) : "");
    const strArr = (v: unknown) =>
      Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean).slice(0, 8) : [];
    const content = {
      playerId,
      title: str(report.title) || "Bilan du trimestre",
      progression: str(report.progression),
      assiduite: str(report.assiduite),
      comportement: str(report.comportement),
      axes: strArr(report.axes),
      source: "manual",
    } as const;

    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .eq("student_id", playerId);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const userIds = [...new Set([playerId, ...parentIds])];

    const { data: player } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", playerId)
      .maybeSingle();
    const playerName = player ? `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim() : "Joueur";

    const { error: upsertErr } = await supabase
      .from("quarterly_reports")
      .upsert(
        {
          team_id: teamId,
          player_id: playerId,
          quarter,
          content: content as unknown as Record<string, unknown>,
          created_by: user.id,
        },
        { onConflict: "team_id,player_id,quarter" }
      );
    if (upsertErr) {
      console.error("[reports/quarterly] manual upsert error:", upsertErr);
      return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
    }

    const { error: notifyErr } = await supabase.from("notifications").insert(
      userIds.map((uid) => ({
        user_id: uid,
        team_id: teamId,
        type: "bilan_trimestriel",
        title: `Bilan du trimestre — ${playerName}`,
        body: `${content.title}. ${content.progression}`.slice(0, 2000),
        reference_id: `quarterly:${playerId}:${quarter}`,
        url: `/stats/${playerId}`,
        delivered_at: new Date().toISOString(),
      }))
    );
    if (notifyErr) {
      console.error("[reports/quarterly] manual notify error:", notifyErr);
    }

    return NextResponse.json({ ok: true, reports: [{ player_id: playerId, content }], mode: "manual" });
  }

  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();

  const [{ data: team }, { data: members }, { data: events }] = await Promise.all([
    supabase.from("teams").select("name").eq("id", teamId).maybeSingle(),
    supabase.from("team_members").select("user_id").eq("team_id", teamId).in("role", ["player"]),
    supabase.from("events").select("id, type").eq("team_id", teamId).gte("event_date", startISO).lte("event_date", endISO),
  ]);

  const playerIds = (members || []).map((m) => m.user_id);
  if (playerIds.length === 0) {
    return NextResponse.json({ error: "Aucun joueur dans l'équipe" }, { status: 400 });
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, is_active")
    .in("id", playerIds);
  const active = (profiles || []).filter((p) => p.is_active !== false);
  const activeIds = active.map((p) => p.id as string);

  const matchIds = ((events || []) as { id: string; type: string }[]).filter((e) => e.type === "match").map((e) => e.id);
  const trainingIds = ((events || []) as { id: string; type: string }[]).filter((e) => e.type === "training").map((e) => e.id);

  const [{ data: stats }, { data: attendances }, { data: ratings }, { data: motm }] = await Promise.all([
    matchIds.length > 0
      ? supabase.from("match_stats").select("player_id, event_id, goals, assists, minutes_played, yellow_cards").in("event_id", matchIds)
      : Promise.resolve({ data: [] }),
    trainingIds.length > 0
      ? supabase.from("attendances").select("event_id, user_id, status").in("event_id", trainingIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase.from("match_ratings").select("player_id, rating").in("event_id", matchIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase.from("motm_votes").select("event_id, candidate_id").in("event_id", matchIds)
      : Promise.resolve({ data: [] }),
  ]);

  const statRows = (stats || []) as { player_id: string; event_id: string; goals: number; assists: number; minutes_played: number; yellow_cards: number }[];
  const attRows = (attendances || []) as { event_id: string; user_id: string; status: string }[];
  const ratingRows = (ratings || []) as { player_id: string; rating: number }[];
  const motmRows = (motm || []) as { event_id: string; candidate_id: string }[];

  // MVP par match (top 1, égalité = tous)
  const motmByEvent = new Map<string, number>();
  const perEventCounts = new Map<string, Map<string, number>>();
  for (const v of motmRows) {
    if (!perEventCounts.has(v.event_id)) perEventCounts.set(v.event_id, new Map());
    const m = perEventCounts.get(v.event_id)!;
    m.set(v.candidate_id, (m.get(v.candidate_id) ?? 0) + 1);
  }
  for (const [eventId, counts] of perEventCounts) {
    const top = Math.max(...counts.values());
    if (top > 0) {
      for (const [cand, n] of counts) {
        if (n === top) motmByEvent.set(`${eventId}:${cand}`, 1);
      }
    }
  }

  const aggs = new Map<string, { matches: number; goals: number; assists: number; minutes: number; attendance: { present: number; total: number }; ratingSum: number; ratingCount: number; motm: number; yellows: number }>();
  for (const id of activeIds) {
    aggs.set(id, { matches: 0, goals: 0, assists: 0, minutes: 0, attendance: { present: 0, total: 0 }, ratingSum: 0, ratingCount: 0, motm: 0, yellows: 0 });
  }
  for (const s of statRows) {
    const a = aggs.get(s.player_id);
    if (!a) continue;
    a.matches += 1;
    a.goals += s.goals || 0;
    a.assists += s.assists || 0;
    a.minutes += s.minutes_played || 0;
    a.yellows += s.yellow_cards || 0;
  }
  for (const r of attRows) {
    const a = aggs.get(r.user_id);
    if (!a) continue;
    a.attendance.total += 1;
    if (r.status === "present" || r.status === "late") a.attendance.present += 1;
  }
  for (const r of ratingRows) {
    const a = aggs.get(r.player_id);
    if (!a) continue;
    a.ratingSum += Number(r.rating);
    a.ratingCount += 1;
  }
  for (const [key] of motmByEvent) {
    const candidateId = key.slice(key.indexOf(":") + 1);
    const a = aggs.get(candidateId);
    if (a) a.motm += 1;
  }

  const nameById = new Map(active.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const playerAggs = activeIds
    .map((id) => {
      const a = aggs.get(id)!;
      return {
        playerId: id,
        name: nameById.get(id) || "Joueur",
        matches: a.matches,
        goals: a.goals,
        assists: a.assists,
        minutes: a.minutes,
        attendancePct: a.attendance.total > 0 ? Math.round((a.attendance.present / a.attendance.total) * 100) : 0,
        avgCoachRating: a.ratingCount > 0 ? Math.round((a.ratingSum / a.ratingCount) * 10) / 10 : null,
        motm: a.motm,
        yellowCards: a.yellows,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const teamName = (team as { name?: string } | null)?.name || "équipe";
  let reports;
  try {
    reports = await generateQuarterlyReports({
      teamName,
      quarter,
      quarterStart: startISO.slice(0, 10),
      quarterEnd: endISO.slice(0, 10),
      players: playerAggs,
    });
  } catch (e) {
    console.error("[reports/quarterly] AI generation error:", e);
    const message = e instanceof Error ? e.message : "Erreur lors de la génération des bilans";
    return NextResponse.json({ error: `Échec de la génération IA : ${message}` }, { status: 502 });
  }

  // Sauvegarde
  const reportByPlayer = new Map(reports.map((r) => [r.playerId, r]));
  const upsertRows = [...reportByPlayer.values()].map((r) => ({
    team_id: teamId,
    player_id: r.playerId,
    quarter,
    content: { ...r, source: "ai" },
    created_by: user.id,
  }));
  const { error: upsertErr } = await supabase
    .from("quarterly_reports")
    .upsert(upsertRows, { onConflict: "team_id,player_id,quarter" });
  if (upsertErr) {
    console.error("[reports/quarterly] upsert error:", upsertErr);
    return NextResponse.json({ error: "Erreur lors de la sauvegarde" }, { status: 500 });
  }

  // Notifications joueurs + parents
  let notified = 0;
  for (const r of reports) {
    const { data: links } = await supabase
      .from("parent_student")
      .select("parent_id")
      .eq("team_id", teamId)
      .eq("student_id", r.playerId);
    const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
    const userIds = [...new Set([r.playerId, ...parentIds])];
    const { error } = await supabase.from("notifications").insert(
      userIds.map((uid) => ({
        user_id: uid,
        team_id: teamId,
        type: "bilan_trimestriel",
        title: `Bilan du trimestre — ${nameById.get(r.playerId) || "Joueur"}`,
        body: `${r.title}. ${r.progression}`.slice(0, 2000),
        reference_id: `quarterly:${r.playerId}:${quarter}`,
        url: `/stats/${r.playerId}`,
        delivered_at: new Date().toISOString(),
      }))
    );
    if (error) {
      console.error("[reports/quarterly] notify error:", error);
    } else {
      notified += userIds.length;
    }
  }

  return NextResponse.json({ ok: true, reports, notified, quarter: { key: quarter, label: quarterLabel(quarter) } });
}

export async function GET(req: Request) {
  const auth = await getAuthUserDetailed(req);
  const user = auth.user;
  if (!user) return unauthorized(auth.reason);

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId");
  const quarter = url.searchParams.get("quarter") || currentQuarterKey();
  if (!teamId) {
    return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  }
  const supabase = createAdminClient();
  if (!(await isTeamMember(user.id, teamId))) return forbidden();

  const { data } = await supabase
    .from("quarterly_reports")
    .select("player_id, content, updated_at")
    .eq("team_id", teamId)
    .eq("quarter", quarter);

  return NextResponse.json({ reports: data || [] });
}
