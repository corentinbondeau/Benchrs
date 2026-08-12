import { NextResponse } from "next/server";
import { renderSessionPdf, renderManualSessionPdf, type ManualSession } from "@/lib/training/pdf";
import type { AISession } from "@/lib/training/ai-generator";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const session = body?.session as AISession | ManualSession | undefined;
  const source = body?.source as "ai" | "manual" | undefined;

  if (!session || typeof session !== "object") {
    return NextResponse.json({ error: "Séance invalide" }, { status: 400 });
  }

  try {
    let pdfBuffer: Buffer;
    if (source === "manual") {
      if (!Array.isArray((session as ManualSession).exercises)) {
        return NextResponse.json({ error: "Séance invalide" }, { status: 400 });
      }
      pdfBuffer = await renderManualSessionPdf(session as ManualSession);
    } else {
      const ai = session as AISession;
      if (!Array.isArray(ai.sections) || ai.sections.length === 0) {
        return NextResponse.json({ error: "Séance invalide" }, { status: 400 });
      }
      pdfBuffer = await renderSessionPdf(ai);
    }
    return NextResponse.json({
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[trainings/pdf] échec rendu:", e);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}
