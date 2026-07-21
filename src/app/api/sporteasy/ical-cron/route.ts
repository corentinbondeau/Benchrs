import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncFromIcal } from "@/lib/sporteasy/ical-sync";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const { data: setting } = await supabase
      .from("team_settings")
      .select("value")
      .eq("key", "sporteasy_ical_url")
      .single();

    if (!setting?.value) {
      return NextResponse.json({
        message: "Pas d'URL iCal configurée, sync ignorée",
      });
    }

    const result = await syncFromIcal(setting.value);

    if (result.error) {
      return NextResponse.json(
        { message: result.error, ...result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Sync iCal automatique réussie",
      ...result,
    });
  } catch (error) {
    console.error("iCal cron error:", error);
    return NextResponse.json(
      { error: "Erreur lors de la synchronisation iCal" },
      { status: 500 }
    );
  }
}
