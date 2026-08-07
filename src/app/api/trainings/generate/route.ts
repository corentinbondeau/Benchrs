import { NextResponse } from "next/server";
import { TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import { FOOTBALL_SYSTEMS, generateSessionWithAI } from "@/lib/training/ai-generator";
import { renderSessionPdf } from "@/lib/training/pdf";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const phase = typeof body?.phase === "string" ? body.phase : "";
  if (!TACTICAL_PHASE_NAMES.includes(phase)) {
    return NextResponse.json({ error: "Phase invalide" }, { status: 400 });
  }

  const objectives = Array.isArray(body?.objectives)
    ? body.objectives
        .filter((o: unknown): o is string => typeof o === "string" && o.trim().length > 0)
        .map((o: string) => o.trim().slice(0, 200))
    : [];
  if (objectives.length === 0) {
    return NextResponse.json({ error: "Sélectionne au moins un objectif" }, { status: 400 });
  }
  if (objectives.length > 3) {
    return NextResponse.json({ error: "3 objectifs maximum" }, { status: 400 });
  }

  const playerCount =
    Number.isInteger(body?.playerCount) && body.playerCount >= 1 && body.playerCount <= 99
      ? body.playerCount
      : null;

  const systeme =
    typeof body?.systeme === "string" &&
    (FOOTBALL_SYSTEMS as readonly string[]).includes(body.systeme)
      ? (body.systeme as (typeof FOOTBALL_SYSTEMS)[number])
      : undefined;

  try {
    const session = await generateSessionWithAI(phase, objectives, playerCount, systeme);
    const pdfBuffer = await renderSessionPdf(session);
    return NextResponse.json({
      session,
      pdf: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
    });
  } catch (e) {
    console.error("[trainings/generate] échec IA:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la génération" },
      { status: 500 }
    );
  }
}
