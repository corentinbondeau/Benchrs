import { createClient } from "@/lib/supabase/server";
import { renderPage, escapeHtml, formatDateFr, eventTypeBadge } from "@/lib/legacy/html";
import { getLegacyContext } from "@/lib/legacy/session";

/**
 * Page Agenda legacy (`/legacy/calendar`) — HTML brut, lecture seule.
 * Liste les événements à venir (matchs & entraînements) de l'équipe courante.
 */

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function redirectTo(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

interface EventRow {
  id: string;
  title: string | null;
  type: string | null;
  event_date: string | null;
  location: string | null;
  opponent: string | null;
  status: string | null;
}

function formatTimeFr(input: unknown): string {
  if (input === null || input === undefined || input === "") return "";
  const d = new Date(input as string);
  if (isNaN(d.getTime())) return "";
  try {
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderEventCard(event: EventRow): string {
  const type = event.type === "match" ? "match" : "training";
  const title = event.opponent
    ? `vs ${event.opponent}`
    : event.title || (type === "match" ? "Match" : "Entraînement");
  const date = formatDateFr(event.event_date);
  const time = formatTimeFr(event.event_date);
  const location = event.location;

  return `<div class="event-card">
<div class="event-head">${eventTypeBadge(type)}<p class="event-title">${escapeHtml(title)}</p><p class="event-date">${escapeHtml(date)}${time ? ` · ${escapeHtml(time)}` : ""}</p></div>
${location ? `<p class="event-date">${escapeHtml(location)}</p>` : ""}
</div>`;
}

export async function GET() {
  let ctx: Awaited<ReturnType<typeof getLegacyContext>> = null;

  try {
    const supabase = await createClient();
    ctx = await getLegacyContext(supabase);
  } catch {
    ctx = null;
  }

  if (!ctx) {
    return redirectTo("/legacy/login");
  }

  let events: EventRow[] = [];
  try {
    if (ctx.teamId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("events")
        .select("id, title, type, event_date, location, opponent, status")
        .eq("team_id", ctx.teamId)
        .gte("event_date", new Date().toISOString())
        .order("event_date", { ascending: true })
        .limit(50);
      events = (data as EventRow[]) || [];
    }
  } catch {
    events = [];
  }

  const listBlock =
    events.length === 0
      ? `<p>Aucun événement à venir.</p>`
      : events.map(renderEventCard).join("\n");

  const body = `<div class="container">
  <h1>Agenda</h1>
  ${listBlock}
  <p><a href="/legacy">Retour</a></p>
</div>`;

  return htmlResponse(renderPage({ title: "Benchrs - Agenda", body }), 200);
}
