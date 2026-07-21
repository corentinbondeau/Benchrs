import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const { data: championships, error } = await supabase
    .from("championships")
    .select("*, teams:championship_teams(*, team_name)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(championships || []);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json();
  const { name, season, level } = body;

  if (!name || !season) {
    return NextResponse.json({ error: "name et season requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("championships")
    .insert({
      name,
      season,
      level: level || null,
      created_by: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
