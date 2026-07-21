import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("*, event:events!tasks_event_id_fkey(id, title, event_date, type, status), assignee:profiles!tasks_assigned_to_fkey(id, first_name, last_name, avatar_url)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "coach") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = await req.json();
  const { eventId, title, description, assignedTo } = body;

  if (!eventId || !title) {
    return NextResponse.json(
      { error: "Événement et titre requis" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      event_id: eventId,
      title,
      description: description || null,
      assigned_to: assignedTo || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}
