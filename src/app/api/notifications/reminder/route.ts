import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

  try {
    await transporter.sendMail({
      from: `"Sportplus" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Rappel convocation — ${eventTitle}`,
      text: `Bonjour ${firstName || ""},\n\nN'oubliez pas de répondre à la convocation pour "${eventTitle}" le ${dateStr} à ${timeStr}.\n\nMerci d'ouvrir l'application pour confirmer votre présence.\n\n— Équipe Sportplus`,
    });
  } catch (err) {
    console.error("[reminder] SMTP error:", err);
    return NextResponse.json({ error: "Email send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
