import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import nodemailer from "nodemailer";

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
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error || !data) {
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  const user = data.users.find((u) => u.email === email);

  if (!user) {
    return NextResponse.json(
      { error: "Aucun compte associé à cette adresse email." },
      { status: 404 }
    );
  }

  const redirectTo = "https://sportplus-neon.vercel.app/reset-password";

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

  if (linkError || !linkData) {
    return NextResponse.json(
      { error: "Erreur lors de la génération du lien." },
      { status: 500 }
    );
  }

  const actionLink = linkData.properties.action_link;
  const resetUrl = actionLink.replace(
    /redirect_to=[^&]*/,
    `redirect_to=${encodeURIComponent(redirectTo)}`
  );

  try {
    await transporter.sendMail({
      from: `"Benchrs" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Réinitialisation de votre mot de passe — Benchrs",
      text: `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe.\n\nCliquez sur le lien suivant pour en créer un nouveau :\n\n${resetUrl}\n\nCe lien est valable 1 heure.\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n\n— Équipe Benchrs`,
    });
  } catch (err) {
    console.error("[forgot-password] SMTP error:", err);
    return NextResponse.json({ error: "Erreur lors de l'envoi." }, { status: 500 });
  }

  return NextResponse.json({ message: "Email envoyé." });
}
