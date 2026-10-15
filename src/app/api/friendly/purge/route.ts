import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Supprime les annonces dont la date est passée : un créneau de match amical
// resté "en recherche d'adversaire" après sa date n'a plus aucun intérêt et
// pollue la liste. On ne touche QUE les annonces ouvertes (status='open') :
// un match accepté/confirmé/annulé reste en historique.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("friendly_matches")
    .delete()
    .eq("status", "open")
    .lt("match_date", today)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
