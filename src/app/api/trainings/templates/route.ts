import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden, isTeamCoach, isTeamMember } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/trainings/templates?team_id=xxx[&phase=xxx][&q=xxx]
// Liste les templates de l'équipe, filtres optionnels : phase, recherche texte.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("team_id") ?? "";
  const phase = searchParams.get("phase") ?? "";
  const q = searchParams.get("q") ?? "";

  if (!teamId) {
    return NextResponse.json({ error: "team_id requis" }, { status: 400 });
  }

  if (!(await isTeamMember(user.id, teamId))) {
    return forbidden();
  }

  const supabase = createAdminClient();

  let query = supabase
    .from("session_templates")
    .select("id, title, phase, objective, expertise, is_shared, usage_count, created_by, created_at, updated_at")
    .eq("team_id", teamId)
    .order("updated_at", { ascending: false });

  if (phase) {
    query = query.eq("phase", phase);
  }

  if (q.trim()) {
    query = query.ilike("title", `%${q.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[trainings/templates] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

// ---------------------------------------------------------------------------
// POST /api/trainings/templates
// Crée un nouveau template depuis une session IA générée.
// Body: { team_id, title, phase, objective?, expertise?, session_data, is_shared? }
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);

  const teamId = typeof body?.team_id === "string" ? body.team_id : "";
  if (!teamId) {
    return NextResponse.json({ error: "team_id requis" }, { status: 400 });
  }

  // Seuls les coachs peuvent créer des templates
  if (!(await isTeamCoach(user.id, teamId))) {
    return forbidden();
  }

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title requis" }, { status: 400 });
  }

  const phase = typeof body?.phase === "string" ? body.phase.trim() : "";
  if (!phase) {
    return NextResponse.json({ error: "phase requise" }, { status: 400 });
  }

  if (!body?.session_data || typeof body.session_data !== "object") {
    return NextResponse.json({ error: "session_data requis" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Récupérer le club_id de l'équipe
  const { data: team } = await supabase
    .from("teams")
    .select("club_id")
    .eq("id", teamId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("session_templates")
    .insert({
      team_id: teamId,
      club_id: (team as { club_id: string | null } | null)?.club_id ?? null,
      created_by: user.id,
      title,
      phase,
      objective: typeof body.objective === "string" ? body.objective : null,
      expertise: typeof body.expertise === "string" ? body.expertise : "UEFA B",
      session_data: body.session_data,
      is_shared: body.is_shared === true,
    })
    .select("id, title, phase, objective, expertise, is_shared, usage_count, created_at")
    .single();

  if (error) {
    console.error("[trainings/templates] POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data }, { status: 201 });
}
