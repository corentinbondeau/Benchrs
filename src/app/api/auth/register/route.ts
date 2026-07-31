import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types";

export async function POST(req: Request) {
  try {
    const { email, password, firstName, lastName, role, phone } =
      await req.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Champs obligatoires manquants" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Le rôle est per-équipe : il est demandé à la rejoint d'une équipe,
    // pas à l'inscription. On garde un défaut "player" pour le profil.
    const { error: profileError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      role: (role as UserRole) || "player",
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      is_active: true,
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      user: authData.user,
      message: "Compte cree avec succes",
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
