import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized, forbidden } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rateLimit";
import { callAI } from "@/lib/ai";
import { fetchClubSeasonReport } from "@/lib/club/seasonReport";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized("unauthorized");

  if (!rateLimit(`club-bilan:${user.id}`, { limit: 10, windowMs: 60_000 })) {
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

    const summary = report.teams
      .map((t) => {
        const assid = t.attendanceAvg === null ? "non mesurée" : `${t.attendanceAvg}%`;
        return `- ${t.teamName} : ${t.players} joueurs, ${t.matches} matchs (${t.wins}V ${t.draws}N ${t.losses}D), buts ${t.goalsFor}-${t.goalsAgainst}, assiduité ${assid}, licences ${t.licencesValid}/${t.licencesTotal}, cotisations ${t.cotisationsPaid.toFixed(0)}€ recouvrées sur ${t.cotisationsExpected.toFixed(0)}€, solde trésorerie ${(t.income - t.expense).toFixed(0)}€.`;
      })
      .join("\n");

    const system =
      "Tu es secrétaire d'un club de football amateur français. Tu rédiges un bilan de saison clair, objectif et encourageant pour le comité du club. " +
      "Style : texte structuré en paragraphes courts (sections « Vie sportive », « Vie du club », « Points d'attention », « Pistes d'amélioration »), quelques phrases par section maximum, chiffres exacts du club, aucune invention de données. " +
      "Réponds uniquement avec le contenu du bilan, sans objet ni salutation.";

    const userMsg =
      `Bilan de saison ${season} du club « ${report.clubName} » (${report.teams.length} équipes).\n\n` +
      `Totaux club : ${report.totals.players} joueurs, ${report.totals.matches} matchs (${report.totals.wins}V ${report.totals.draws}N ${report.totals.losses}D), buts ${report.totals.goalsFor}-${report.totals.goalsAgainst}, ` +
      `licences ${report.totals.licencesValid}/${report.totals.licencesTotal}, cotisations recouvrées ${report.totals.cotisationsPaid.toFixed(0)}€ sur ${report.totals.cotisationsExpected.toFixed(0)}€, ` +
      `recettes +${report.totals.income.toFixed(0)}€, dépenses -${report.totals.expense.toFixed(0)}€.\n\n` +
      `Par équipe :\n${summary}`;

    const bilan = await callAI(system, userMsg, {
      temperature: 0.6,
      maxTokens: 1600,
    });

    return NextResponse.json({ bilan });
  } catch (e) {
    console.error("[clubs/bilan-ia] échec:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error && String(e.message).includes("IA")
            ? e.message
            : "Erreur lors de la génération du bilan",
      },
      { status: 500 }
    );
  }
}