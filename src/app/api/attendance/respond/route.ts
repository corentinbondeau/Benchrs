import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auth } from "@/lib/auth/config";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json();
  const { event_id, status, absence_reason } = body;

  if (!event_id || !status) {
    return NextResponse.json({ error: "event_id et status requis" }, { status: 400 });
  }

  if (status === "absent" && !absence_reason) {
    return NextResponse.json({ error: "Un motif d'absence est requis" }, { status: 400 });
  }

  const validStatuses = ["present", "absent", "late", "excused"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("attendances")
    .upsert(
      {
        event_id,
        user_id: session.user.id,
        status,
        absence_reason: status === "absent" ? absence_reason : null,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
