import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const supabase = createAdminClient();
  const body = await req.json();
  const { user_id, subscription, team_id } = body;

  if (!user_id || !subscription) {
    return NextResponse.json({ error: "user_id and subscription required" }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id,
    team_id: team_id || null,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }, { onConflict: "user_id, endpoint" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");

  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
