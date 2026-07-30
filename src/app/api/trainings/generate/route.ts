import { NextResponse } from "next/server";
import { generateSession, type Phase } from "@/lib/training/generator";

export async function POST(req: Request) {
  const body = await req.json();
  const { phase, themes, playerCount } = body;

  if (!phase || !playerCount) {
    return NextResponse.json({ error: "Phase et nombre de joueurs requis" }, { status: 400 });
  }

  const session = generateSession(phase as Phase, themes || [], playerCount);
  return NextResponse.json(session);
}
