import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { userId, eventTitle, eventDate } = await req.json();

  if (!userId || !eventTitle || !eventDate) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", userId)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: authUser } = await supabase.auth.admin.getUserById(userId);
  const email = authUser?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "No email found" }, { status: 404 });
  }

  const date = new Date(eventDate);
  const dateStr = date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeStr = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Sportplus <onboarding@resend.dev>",
      to: email,
      subject: `Rappel convocation — ${eventTitle}`,
      text: `Bonjour ${profile.first_name},\n\nN'oubliez pas de répondre à la convocation pour "${eventTitle}" le ${dateStr} à ${timeStr}.\n\nMerci d'ouvrir l'application pour confirmer votre présence.\n\n— Équipe Sportplus`,
    }),
  });

  if (!resendRes.ok) {
    const body = await resendRes.text();
    return NextResponse.json({ error: body }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
