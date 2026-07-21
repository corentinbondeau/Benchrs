import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName, role, phone, parentId, childEmail } =
      await req.json();

    if (!email || !password || !firstName || !lastName || !role) {
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

    const { error: profileError } = await supabase.from("profiles").insert({
      id: authData.user.id,
      role: role as UserRole,
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

    if (role === "parent") {
      let studentId = parentId;

      // If childEmail provided, look up the player by email
      if (!studentId && childEmail) {
        const { data: childUser } = await supabase.auth.admin.listUsers();
        const child = childUser?.users?.find((u) => u.email === childEmail);
        if (child) {
          const { data: childProfile } = await supabase
            .from("profiles")
            .select("id, role")
            .eq("id", child.id)
            .single();
          if (childProfile?.role === "player") {
            studentId = child.id;
          }
        }
      }

      if (studentId) {
        await supabase.from("parent_student").insert({
          parent_id: authData.user.id,
          student_id: studentId,
        });
      }
    }

    return NextResponse.json({
      user: authData.user,
      message: "Compte créé avec succès",
    });
  } catch {
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
