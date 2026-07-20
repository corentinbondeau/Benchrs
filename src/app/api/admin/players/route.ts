import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: players, error } = await supabase
    .from("profiles")
    .select("*")
    .in("role", ["player", "parent"])
    .order("last_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ players });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json();
  const { email, password, firstName, lastName, role, phone, position, shirtNumber } = body;

  if (!email || !password || !firstName || !lastName || !role) {
    return NextResponse.json(
      { error: "Champs obligatoires manquants" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    role: role as UserRole,
    first_name: firstName,
    last_name: lastName,
    phone: phone || null,
    position: position || null,
    shirt_number: shirtNumber ? parseInt(shirtNumber) : null,
    is_active: true,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ user: authData.user, message: "Joueur créé avec succès" });
}
