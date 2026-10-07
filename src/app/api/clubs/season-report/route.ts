import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rateLimit";
import { fetchClubSeasonReport } from "@/lib/club/seasonReport";
import { renderClubReportPdf } from "@/lib/export/clubReportPdf";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized("unauthorized");

  if (!rateLimit(`club-report:${user.id}`, { limit: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const clubId = body?.clubId as string | undefined;
  const season = body?.season as string | undefined;
  if (!clubId || !season || !/^\d{4}-\d{4}$/.test(season)) {
    return NextResponse.json({ error: "clubId et saison requis" }, { status: 400 });
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

  try {
    const report = await fetchClubSeasonReport(supabase, clubId, season);
    if (!report) {
      return NextResponse.json({ error: "Club introuvable" }, { status: 404 });
    }
    const pdfBuffer = await renderClubReportPdf(report);
    return NextResponse.json({
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[clubs/season-report] échec:", e);
    return NextResponse.json(
      { error: "Erreur lors de la génération du rapport" },
      { status: 500 }
    );
  }
}