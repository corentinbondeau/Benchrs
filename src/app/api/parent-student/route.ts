import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth/config";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = await createClient();

  let query = supabase
    .from("parent_student")
    .select("parent_id, student_id, parent:profiles!parent_student_parent_id_fkey(id, first_name, last_name, avatar_url), student:profiles!parent_student_student_id_fkey(id, first_name, last_name, avatar_url, shirt_number, position)");

  // Parents can only see their own links
  if (session.user.role === "parent") {
    query = query.eq("parent_id", session.user.id);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const body = await request.json();
  const { parent_id, student_id } = body;

  if (!parent_id || !student_id) {
    return NextResponse.json({ error: "parent_id et student_id requis" }, { status: 400 });
  }

  const supabase = await createClient();

  // Verify parent is a parent and student is a player
  const [parentRes, studentRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", parent_id).single(),
    supabase.from("profiles").select("role").eq("id", student_id).single(),
  ]);

  if (parentRes.data?.role !== "parent") {
    return NextResponse.json({ error: "L'utilisateur n'est pas un parent" }, { status: 400 });
  }
  if (studentRes.data?.role !== "player") {
    return NextResponse.json({ error: "L'utilisateur n'est pas un joueur" }, { status: 400 });
  }

  const { error } = await supabase.from("parent_student").insert({
    parent_id,
    student_id,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Ce lien existe déjà" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "coach") {
    return NextResponse.json({ error: "Accès restreint aux coachs" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parent_id");
  const studentId = searchParams.get("student_id");

  if (!parentId || !studentId) {
    return NextResponse.json({ error: "parent_id et student_id requis" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("parent_student")
    .delete()
    .eq("parent_id", parentId)
    .eq("student_id", studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
