import { NextResponse } from "next/server";
import { renderSeasonReportPdf } from "@/lib/seasonReportPdf";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const report = body?.report as Record<string, unknown> | undefined;
  const teamName = (body?.teamName as string | undefined) || "";
  const season = (body?.season as string | undefined) || "";

  if (!report || typeof report !== "object") {
    return NextResponse.json({ error: "Rapport invalide" }, { status: 400 });
  }

  try {
    const pdfBuffer = await renderSeasonReportPdf(
      report as unknown as Parameters<typeof renderSeasonReportPdf>[0],
      teamName,
      season
    );
    return NextResponse.json({
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[season/report/pdf] échec rendu:", e);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}
