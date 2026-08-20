import { NextResponse } from "next/server";
import { renderSessionPdf, renderManualSessionPdf, type ManualSession } from "@/lib/training/pdf";
import type { AISession } from "@/lib/training/ai-generator";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const session = body?.session;
  const source = body?.source as "ai" | "manual" | undefined;
  const title = body?.title as string | undefined;
  const objectives = body?.objectives as string[] | null | undefined;
  const notes = body?.notes as string | null | undefined;

  if (!session || typeof session !== "object") {
    return NextResponse.json({ error: "Séance invalide" }, { status: 400 });
  }

  try {
    let pdfBuffer: Buffer;
    if (source === "manual") {
      // Accept both formats:
      // 1. ManualSession object: { title, exercises: [...], objectives?, notes? }
      // 2. Raw Exercise[] array (sent directly from the frontend)
      let manual: ManualSession;
      if (Array.isArray(session)) {
        manual = {
          title: title || "Séance d'entraînement",
          exercises: session,
          objectives: objectives ?? null,
          notes: notes ?? null,
        };
      } else if (Array.isArray((session as ManualSession).exercises)) {
        manual = session as ManualSession;
      } else {
        return NextResponse.json({ error: "Séance invalide" }, { status: 400 });
      }
      if (manual.exercises.length === 0) {
        return NextResponse.json({ error: "Séance invalide (aucun exercice)" }, { status: 400 });
      }
      pdfBuffer = await renderManualSessionPdf(manual);
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
