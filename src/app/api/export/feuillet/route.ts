import { NextResponse } from "next/server";
import { getAuthUser, isTeamCoach } from "@/lib/api-auth";
import { renderFeuilletPdf, type FeuilletPosition, type FeuilletPlayer } from "@/lib/export/feuilletPdf";

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

  const teamName = (body?.teamName as string) || "Équipe";
  const eventTitle = (body?.eventTitle as string) || "Match";
  const eventDate = (body?.eventDate as string) || "";
  const formationName = (body?.formationName as string) || "4-3-3";
  const captainId = (body?.captain_id as string | null) || null;
  const positions = (body?.positions as FeuilletPosition[]) || [];
  const bench = (body?.bench as (string | null)[]) || [];
  const players = (body?.players as FeuilletPlayer[]) || [];

  if (!positions.length) {
    return NextResponse.json({ error: "Aucune position définie" }, { status: 400 });
  }

  try {
    const formattedDate = eventDate
      ? new Date(eventDate).toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    const pdfBuffer = await renderFeuilletPdf({
      teamName,
      eventTitle,
      eventDate: formattedDate,
      formationName,
      positions,
      bench,
      captain_id: captainId,
      players,
    });

    return NextResponse.json({
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[export/feuillet] échec rendu:", e);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}
