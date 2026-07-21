import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyNewEvent } from "@/lib/notifications/events";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("event_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { type, title, description, event_date, end_date, location, opponent } = body;

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      type,
      title,
      description,
      event_date,
      end_date,
      location,
      opponent,
      status: "upcoming",
      created_by: user.id,
    })
    .select("id, title, type, event_date, location")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (event) {
    await notifyNewEvent({
      id: event.id,
      title: event.title,
      type: event.type,
      event_date: event.event_date,
      location: event.location,
    });
  }

  return NextResponse.json(event);
}
