import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const userExists = data.users.some((u) => u.email === email);

  if (!userExists) {
    return NextResponse.json(
      { error: "Aucun compte associé à cette adresse email." },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: "Compte trouvé." });
}
