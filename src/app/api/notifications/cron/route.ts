import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/notifications/push";

export const maxDuration = 60;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: upcomingEvents } = await supabase
      .from("events")
      .select("id, title, event_date")
      .in("status", ["upcoming"])
      .lte("event_date", tomorrow.toISOString())
      .gte("event_date", now.toISOString());

    if (upcomingEvents && upcomingEvents.length > 0) {
      for (const event of upcomingEvents) {
        const { data: pendingAttendances } = await supabase
          .from("attendances")
          .select("id, user_id")
          .eq("event_id", event.id)
          .eq("status", "pending");

        if (pendingAttendances) {
          for (const att of pendingAttendances) {
            await sendPushToUser(att.user_id, {
              title: `Rappel : ${event.title}`,
              body: "Vous n'avez pas encore répondu à cette convocation. Confirmez votre présence !",
              url: "/attendance",
            });

            await supabase.from("notifications").insert({
              user_id: att.user_id,
              title: `Rappel : ${event.title}`,
              body: "Vous n'avez pas encore répondu à cette convocation.",
              type: "attendance",
              reference_id: event.id,
            });
          }
        }
      }
    }

    return NextResponse.json({
      message: "Relances envoyées",
      eventsProcessed: upcomingEvents?.length || 0,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'exécution du cron" },
      { status: 500 }
    );
  }
}
