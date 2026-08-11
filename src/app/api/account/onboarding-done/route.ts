import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser, unauthorized } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("profiles")
      .update({ parent_onboarding_done: true })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json(
        { error: "Impossible de marquer l'onboarding comme terminé" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
