import { createClient } from "@/lib/supabase/server";
import { renderPage, escapeHtml, eventCard, heroCard, formatDateFr } from "@/lib/legacy/html";

/**
 * Page de présence legacy (`/legacy/attendance`) — HTML brut, zéro React,
 * zéro bundle Next.js. Formulaires POST natifs (sans JS) pour répondre aux
 * convocations `pending`.
 *
 * Sécurité : toutes les lectures/écritures passent par la session utilisateur
 * (`createClient()` -> client Supabase "anon" + cookies de session), jamais
 * par le service role. C'est la policy RLS (`team_id ∈ team_members(auth.uid())`
 * / `user_id = auth.uid()`) qui garantit qu'un `attendanceId` hors périmètre
 * (autre équipe / autre utilisateur) ne peut ni être lu ni être modifié :
 * l'update `.eq("id", attendanceId)` renverra alors 0 ligne affectée, sans
 * qu'on puisse distinguer "ligne inexistante" de "ligne hors RLS" (pas de
 * fuite d'information).
 */

const VALID_STATUSES = ["present", "absent", "late"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: unknown): value is ValidStatus {
  return (
    typeof value === "string" &&
    (VALID_STATUSES as readonly string[]).includes(value)
  );
}

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

interface AttendanceRow {
  id: string;
  event?: {
    title?: string | null;
    event_date?: string | null;
  } | null;
}

function renderAttendancePage(options: {
  attendances: AttendanceRow[];
  ok?: boolean;
  error?: string;
}): string {
  const { attendances, ok, error } = options;

  const confirmationBlock = ok
    ? `<p class="confirmation">Réponse enregistrée.</p>`
    : "";

  const errorBlock = error ? `<p class="error">${escapeHtml(error)}</p>` : "";

  // Carte hero : la prochaine convocation en attente met l'événement en avant.
  const first = attendances[0];
  const heroBlock = first
    ? heroCard({
        label: "Prochaine convocation",
        title: first.event?.title || "Convocation",
        details: formatDateFr(first.event?.event_date) || "Date à confirmer",
      })
    : "";

  const listBlock =
    attendances.length === 0
      ? `<p>Aucune convocation en attente.</p>`
      : attendances
          .map((att) =>
            eventCard({
              title: att.event?.title || "Convocation",
              date: formatDateFr(att.event?.event_date),
              status: "pending",
              attendanceId: att.id,
              withActions: true,
            })
          )
          .join("\n");

  const body = `${heroBlock}
<div class="container">
  <h1>Mes présences</h1>
  <p class="help-text">Répondez aux convocations en attente ci-dessous.</p>
  ${confirmationBlock}
  ${errorBlock}
  ${listBlock}
  <p><a href="/legacy">Retour</a></p>
</div>`;

  return renderPage({ title: "Benchrs - Mes présences", body });
}

export async function GET(request: Request) {
  let user = null;

  try {
    const supabase = await createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    user = sessionUser;
  } catch {
    user = null;
  }

  if (!user) {
    return redirectTo("/legacy/login");
  }

  const url = new URL(request.url);
  const ok = url.searchParams.get("ok") === "1";

  let attendances: AttendanceRow[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("attendances")
      .select("id, event:events!attendances_event_id_fkey(title, event_date)")
      .eq("user_id", user.id)
      .eq("status", "pending");
    attendances = (data as AttendanceRow[]) || [];
  } catch {
    attendances = [];
  }

  return htmlResponse(renderAttendancePage({ attendances, ok }), 200);
}

export async function POST(request: Request) {
  let user = null;

  try {
    const supabase = await createClient();
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    user = sessionUser;
  } catch {
    user = null;
  }

  if (!user) {
    return redirectTo("/legacy/login");
  }

  let attendanceId = "";
  let status = "";

  try {
    const formData = await request.formData();
    attendanceId = String(formData.get("attendanceId") ?? "");
    status = String(formData.get("status") ?? "");
  } catch {
    return htmlResponse(
      renderAttendancePage({
        attendances: [],
        error: "Requête invalide, veuillez réessayer.",
      }),
      400
    );
  }

  if (!attendanceId || !isValidStatus(status)) {
    return htmlResponse(
      renderAttendancePage({
        attendances: [],
        error: "Statut invalide.",
      }),
      400
    );
  }

  try {
    const supabase = await createClient();
    // Update via la session user : la RLS filtre automatiquement les lignes
    // hors périmètre (autre équipe / autre utilisateur), jamais de service role.
    await supabase
      .from("attendances")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", attendanceId);
  } catch {
    return htmlResponse(
      renderAttendancePage({
        attendances: [],
        error: "Une erreur est survenue, veuillez réessayer.",
      }),
      400
    );
  }

  return redirectTo("/legacy/attendance?ok=1");
}
