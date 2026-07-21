import { NextRequest, NextResponse } from "next/server";
import { syncSportEasyData } from "@/lib/sporteasy/sync";
import { auth } from "@/lib/auth/config";

export const maxDuration = 60;

async function handleSync() {
  const session = await auth();

  if (!session || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const result = await syncSportEasyData();

  if (result.error) {
    return NextResponse.json(
      { message: result.error, ...result },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Synchronisation réussie",
    ...result,
  });
}

export async function POST(_req: NextRequest) {
  return handleSync();
}

export async function GET() {
  return handleSync();
}
