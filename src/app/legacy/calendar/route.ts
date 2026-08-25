import { createClient } from "@/lib/supabase/server";
import { renderPage, escapeHtml, field, formatDateFr, eventTypeBadge } from "@/lib/legacy/html";
import { getLegacyContext } from "@/lib/legacy/session";

/**
 * Page Agenda legacy (`/legacy/calendar`) — HTML brut, zéro React, zéro JS.
 * Liste les événements à venir (matchs & entraînements) de l'équipe courante,
 * et permet au staff (coach/owner) d'en créer un via un formulaire POST natif.
 *
 * Sécurité : la création est réservée aux rôles "coach"/"owner" (vérifié
 * côté serveur, pas seulement masqué côté affichage). L'insert passe
 * toujours par le client de session (jamais le service role) et inclut
 * explicitement `team_id: ctx.teamId` / `created_by: ctx.userId`, requis
 * par la policy RLS "Members can manage events" (team_id ∈
 * team_members(auth.uid())).
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

function renderCalendarPage(options: {
  events: EventRow[];
  isCoach: boolean;
  ok?: boolean;
  error?: string;
}): string {
  const { events, isCoach, ok, error } = options;

  const confirmationBlock = ok ? `<p class="confirmation">Événement créé.</p>` : "";
  const errorBlock = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  const listBlock =
    events.length === 0
      ? `<p>Aucun événement à venir.</p>`
      : events.map(renderEventCard).join("\n");

  const createFormBlock = isCoach
    ? `<h1>Créer un événement</h1>
<form method="POST" action="/legacy/calendar">
<label for="type">Type</label>
<select id="type" name="type">
<option value="training">Entraînement</option>
<option value="match">Match</option>
</select>
${field({ name: "title", label: "Titre", type: "text" })}
${field({ name: "eventDate", label: "Date", type: "date" })}
<p class="help-text">AAAA-MM-JJ</p>
${field({ name: "eventTime", label: "Heure (optionnel)", type: "time" })}
${field({ name: "location", label: "Lieu (optionnel)", type: "text" })}
${field({ name: "opponent", label: "Adversaire (si match, optionnel)", type: "text" })}
<button type="submit">Créer l'événement</button>
</form>`
    : "";

  const body = `<div class="container">
  <h1>Agenda</h1>
  ${confirmationBlock}
  ${errorBlock}
  ${listBlock}
  ${createFormBlock}
  <p><a href="/legacy">Retour</a></p>
</div>`;

  return renderPage({ title: "Benchrs - Agenda", body });
}

async function fetchUpcomingEvents(teamId: string | null): Promise<EventRow[]> {
  let events: EventRow[] = [];
  try {
    if (teamId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("events")
        .select("id, title, type, event_date, location, opponent, status")
        .eq("team_id", teamId)
        .gte("event_date", new Date().toISOString())
        .order("event_date", { ascending: true })
        .limit(50);
      events = (data as EventRow[]) || [];
    }
  } catch {
    events = [];
  }
  return events;
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const ok = url.searchParams.get("ok") === "1";

  const isCoach = ctx.role === "coach" || ctx.role === "owner";
  const events = await fetchUpcomingEvents(ctx.teamId);

  return htmlResponse(renderCalendarPage({ events, isCoach, ok }), 200);
}

export async function POST(request: Request) {
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

  const isCoach = ctx.role === "coach" || ctx.role === "owner";

  if (!isCoach) {
    const events = await fetchUpcomingEvents(ctx.teamId);
    return htmlResponse(
      renderCalendarPage({ events, isCoach, error: "Action réservée au staff." }),
      403
    );
  }

  if (!ctx.teamId) {
    const events = await fetchUpcomingEvents(ctx.teamId);
    return htmlResponse(
      renderCalendarPage({ events, isCoach, error: "Aucune équipe associée." }),
      400
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    const events = await fetchUpcomingEvents(ctx.teamId);
    return htmlResponse(
      renderCalendarPage({ events, isCoach, error: "Requête invalide, veuillez réessayer." }),
      400
    );
  }

  const type = String(formData.get("type") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const eventDate = String(formData.get("eventDate") ?? "").trim();
  const eventTime = String(formData.get("eventTime") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const opponent = String(formData.get("opponent") ?? "").trim();

  const events = await fetchUpcomingEvents(ctx.teamId);

  if (!title || !eventDate || (type !== "match" && type !== "training")) {
    return htmlResponse(
      renderCalendarPage({ events, isCoach, error: "Champs obligatoires manquants." }),
      400
    );
  }

  const parsedDate = new Date(`${eventDate}T${eventTime || "12:00"}:00`);
  if (isNaN(parsedDate.getTime())) {
    return htmlResponse(
      renderCalendarPage({ events, isCoach, error: "Date invalide." }),
      400
    );
  }
  const eventDateIso = parsedDate.toISOString();

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("events").insert({
      title,
      type,
      event_date: eventDateIso,
      meeting_time: eventTime || null,
      location: location || null,
      opponent: type === "match" ? opponent || null : null,
      status: "upcoming",
      created_by: ctx.userId,
      team_id: ctx.teamId,
    });

    if (error) {
      return htmlResponse(
        renderCalendarPage({ events, isCoach, error: "Une erreur est survenue, veuillez réessayer." }),
        400
      );
    }
  } catch {
    return htmlResponse(
      renderCalendarPage({ events, isCoach, error: "Une erreur est survenue, veuillez réessayer." }),
      400
    );
  }

  return redirectTo("/legacy/calendar?ok=1");
}
