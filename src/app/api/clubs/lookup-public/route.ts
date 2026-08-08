import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeFffNumber } from "@/lib/clubs";

// Lookup public d'un club par numéro d'affiliation FFF (utilisé pendant l'inscription,
// avant la création du compte). Ne renvoie que l'identifiant et le nom.
export async function GET(req: Request) {
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
