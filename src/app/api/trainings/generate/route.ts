import { NextResponse } from "next/server";
import { generateSession, PHASES, type Phase } from "@/lib/training/generator";

const VALID_PHASES = PHASES.map((p) => p.value) as string[];

export async function POST(req: Request) {
  const body = await req.json();
  const { phase, themes, playerCount } = body;

  if (typeof phase !== "string" || !VALID_PHASES.includes(phase)) {
    return NextResponse.json({ error: "Phase invalide" }, { status: 400 });
  }

  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 99) {
    return NextResponse.json({ error: "Nombre de joueurs invalide" }, { status: 400 });
  }

  const safeThemes = Array.isArray(themes)
    ? themes
        .filter((t: unknown) => typeof t === "string")
        .slice(0, 20)
        .map((t: string) => t.slice(0, 100))
    : [];

  const session = generateSession(phase as Phase, safeThemes, playerCount);
  return NextResponse.json(session);
}
