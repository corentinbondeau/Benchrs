import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/notifications/push";

export async function notifyNewEvent(event: {
  id: string;
  title: string;
  type: string;
  event_date: string;
  location?: string | null;
}) {
  const supabase = createAdminClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .in("role", ["player", "parent"]);

  if (!profiles || profiles.length === 0) return;

  const typeLabel = event.type === "match" ? "Match" : "Entraînement";
  const dateStr = new Date(event.event_date).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const title = `Nouveau ${typeLabel} : ${event.title}`;
  const body = `Le ${dateStr}${event.location ? ` à ${event.location}` : ""}`;

  for (const profile of profiles) {
    await supabase.from("notifications").insert({
      user_id: profile.id,
      title,
      body,
      type: "event",
      reference_id: event.id,
    });

    await sendPushToUser(profile.id, { title, body, url: "/calendar" });
  }
}
