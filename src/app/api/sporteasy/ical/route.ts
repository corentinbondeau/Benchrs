import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFromIcal } from "@/lib/sporteasy/ical-sync";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { icalUrl } = await req.json();

  if (!icalUrl) {
    return NextResponse.json(
      { error: "URL du calendrier iCal requise" },
      { status: 400 }
    );
  }

  if (!icalUrl.includes("sporteasy") && !icalUrl.endsWith(".ics")) {
    return NextResponse.json(
      { error: "L'URL ne semble pas être un lien SportEasy" },
      { status: 400 }
    );
  }

  const result = await syncFromIcal(icalUrl);

  if (result.error) {
    return NextResponse.json(
      { message: result.error, ...result },
      { status: 500 }
    );
  }

  return NextResponse.json({
    message: "Import iCal réussi",
    ...result,
  });
}

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: setting } = await supabase
    .from("team_settings")
    .select("value")
    .eq("key", "sporteasy_ical_url")
    .single();

  return NextResponse.json({
    icalUrl: setting?.value || null,
  });
}
