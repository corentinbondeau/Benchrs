import { NextResponse } from "next/server";
import { getAuthUser, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderRosterPdf, type RosterRow } from "@/lib/export/rosterPdf";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const teamId = body?.teamId as string | undefined;
  if (!teamId || typeof teamId !== "string") {
    return NextResponse.json({ error: "teamId requis" }, { status: 400 });
  }

  if (!(await isTeamCoach(user.id, teamId))) {
    return NextResponse.json({ error: "Accès réservé au coach" }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const [{ data: team }, { data: members }] = await Promise.all([
      admin.from("teams").select("name").eq("id", teamId).maybeSingle(),
      admin
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", teamId),
    ]);

    const memberRows = (members || []) as { user_id: string; role: string }[];
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, role, first_name, last_name, position, shirt_number, date_of_birth, vma, vmi, is_active")
      .in(
        "id",
        memberRows.map((m) => m.user_id)
      );

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ error: "Effectif vide" }, { status: 400 });
    }

    const roleMap = new Map(
      memberRows.map((m) => [m.user_id, m.role === "owner" ? "coach" : m.role])
    );

    const toRow = (p: (typeof profiles)[number]): RosterRow => ({
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position,
      shirt_number: p.shirt_number,
      birth_year: p.date_of_birth ? String(new Date(p.date_of_birth).getFullYear()) : null,
      vma: p.vma,
      vmi: p.vmi,
      active: p.is_active,
    });

    const rows = (profiles as (typeof profiles)[number][]).map((p) => ({
      row: toRow(p),
      role: (roleMap.get(p.id) || p.role) as string,
    }));
    const players = rows.filter((r) => r.role === "player" && r.row.active).map((r) => r.row);
    const coaches = rows
      .filter((r) => r.role === "coach")
      .sort((a, b) => a.row.last_name.localeCompare(b.row.last_name))
      .map((r) => r.row);
    players.sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999));

    const now = new Date();
    const season = `${now.getFullYear()}-${now.getFullYear() + 1}`;
    const pdfBuffer = await renderRosterPdf({
      teamName: (team as { name: string } | null)?.name || "Équipe",
      season,
      exportedAt: now.toLocaleDateString("fr-FR"),
      coaches,
      players,
    });

    return NextResponse.json({
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[export/roster] échec rendu:", e);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}
