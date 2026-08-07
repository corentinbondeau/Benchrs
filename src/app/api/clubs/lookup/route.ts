import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeFffNumber } from "@/lib/clubs";

// Lookup d'un club par numéro d'affiliation FFF (utilisé dans le formulaire de création).
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const fff = normalizeFffNumber(searchParams.get("fffNumber") ?? "");
  if (!fff) {
    return NextResponse.json({ club: null });
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("fff_number", fff)
    .maybeSingle();

  return NextResponse.json({ club: data ?? null });
}
