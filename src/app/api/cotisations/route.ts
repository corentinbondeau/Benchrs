import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth/config";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || "2025-2026";

  const supabase = await createClient();

  // Get all active players
  const { data: players } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, shirt_number")
    .eq("role", "player")
    .eq("is_active", true)
    .order("last_name");

  // Get licences for this season
  const { data: licences } = await supabase
    .from("licences")
    .select("*")
    .eq("season", season);

  // Get cotisations for this season
  const { data: cotisations } = await supabase
    .from("cotisations")
    .select("*")
    .eq("season", season);

  // Merge data
  const result = (players || []).map((player) => {
    const licence = licences?.find((l) => l.player_id === player.id);
    const cotisation = cotisations?.find((c) => c.player_id === player.id);
    return {
      ...player,
      licence: licence || null,
      cotisation: cotisation || null,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const body = await request.json();
  const { player_id, season, amount_expected, amount_paid, status, payment_method, payment_date, notes } = body;

  if (!player_id) {
    return NextResponse.json({ error: "player_id requis" }, { status: 400 });
  }

  const supabase = await createClient();
  const seasonValue = season || "2025-2026";

  // Upsert cotisation
  const { data, error } = await supabase
    .from("cotisations")
    .upsert({
      player_id,
      season: seasonValue,
      amount_expected: amount_expected || 0,
      amount_paid: amount_paid || 0,
      status: status || "pending",
      payment_method: payment_method || null,
      payment_date: payment_date || null,
      notes: notes || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "player_id,season" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
