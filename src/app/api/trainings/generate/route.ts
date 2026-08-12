import { NextResponse } from "next/server";
import { TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import {
  EXPERTISE_LEVELS,
  FOOTBALL_SYSTEMS,
  generateSessionWithAI,
  type ExpertiseLevel,
} from "@/lib/training/ai-generator";
import { renderSessionPdf } from "@/lib/training/pdf";
import { getAuthUser, unauthorized, forbidden, isTeamMember } from "@/lib/api-auth";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);

  const teamId = typeof body?.team_id === "string" ? body.team_id : "";
  if (!teamId || !(await isTeamMember(user.id, teamId))) {
    return forbidden();
  }

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

  const expertise =
    typeof body?.expertise === "string" &&
    (EXPERTISE_LEVELS as readonly string[]).includes(body.expertise)
      ? (body.expertise as ExpertiseLevel)
      : "UEFA B";

  try {
    const session = await generateSessionWithAI(phase, objectives, playerCount, systeme, expertise);
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
