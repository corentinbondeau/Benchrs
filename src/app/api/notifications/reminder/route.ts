import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { userId, email: directEmail, eventTitle, eventDate } = await req.json();

  if ((!userId && !directEmail) || !eventTitle || !eventDate) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let email = directEmail;
  let firstName = "";

  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name")
      .eq("id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    firstName = profile.first_name;

    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    email = authUser?.user?.email;
  }

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
      text: `Bonjour ${firstName || ""}\n\nN'oubliez pas de répondre à la convocation pour "${eventTitle}" le ${dateStr} à ${timeStr}.\n\nMerci d'ouvrir l'application pour confirmer votre présence.\n\n— Équipe Sportplus`,
    }),
  });

  if (!resendRes.ok) {
    const body = await resendRes.text();
    console.error("[reminder] Resend error:", resendRes.status, body);
    return NextResponse.json({ error: `Resend ${resendRes.status}: ${body}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
