interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("Resend API key not configured, skipping email");
    return null;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SportPlus <noreply@sportplus.app>",
        to,
        subject,
        html,
      }),
    });

    return res.json();
  } catch (error) {
    console.error("Email send failed:", error);
    return null;
  }
}

export function attendanceReminderEmail(
  firstName: string,
  eventTitle: string,
  eventDate: string
): { subject: string; html: string } {
  const dateStr = new Date(eventDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    subject: `Rappel : ${eventTitle} — Confirmez votre présence`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0A1628; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0;">⚽ SportPlus</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb;">
          <h2>Bonjour ${firstName},</h2>
          <p>Vous n&apos;avez pas encore répondu à la convocation pour :</p>
          <div style="background: white; border-radius: 8px; padding: 16px; margin: 16px 0; border-left: 4px solid #EAB308;">
            <strong>${eventTitle}</strong><br/>
            <span style="color: #666;">📅 ${dateStr}</span>
          </div>
          <p>Merci de confirmer votre présence le plus tôt possible.</p>
          <a href="https://sportplus.app/attendance" style="display: inline-block; background: #1E40AF; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Répondre maintenant
          </a>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
          SportPlus — Gestion d&apos;équipe de football
        </div>
      </div>
    `,
  };
}
