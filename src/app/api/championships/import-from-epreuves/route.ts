import { NextResponse } from "next/server";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateIngestPayload } from "@/lib/dofa/ingest-validation";
import { buildMatchUpserts } from "@/lib/dofa/persist-mapping";
import { planEventSync, type ExistingEventRecord } from "@/lib/dofa/event-sync";
import type { DofaPouleRef } from "@/lib/dofa/types";

const RATE_LIMIT_WINDOW_MS = 60_000;

const GENERIC_INVALID_PAYLOAD_MESSAGE =
  "Le payload transmis est invalide. Vérifiez le format des données importées.";

const GENERIC_DATABASE_ERROR_MESSAGE =
  "Une erreur serveur est survenue pendant le traitement de l'import. Réessayez plus tard.";

const MIGRATION_MISSING_MESSAGE =
  "Une erreur serveur est survenue (configuration de la base incomplète). Contactez l'administrateur.";

const MIGRATION_MISSING_PG_CODES = new Set(["42703", "42P10"]);

function databaseErrorResponse(context: string, error: { code?: string; message?: string } | null) {
  console.error(`[dofa/import-from-epreuves] Erreur Supabase (${context}):`, error);

  if (error?.code && MIGRATION_MISSING_PG_CODES.has(error.code)) {
    console.error(
      `[dofa/import-from-epreuves] Migration probablement manquante (code=${error.code}, contexte=${context}).`
    );
    return NextResponse.json({ error: MIGRATION_MISSING_MESSAGE }, { status: 500 });
  }

  return NextResponse.json({ error: GENERIC_DATABASE_ERROR_MESSAGE }, { status: 500 });
}

interface IngestRequestBody {
  teamId?: string;
  cpNo?: number;
  phase?: number;
  poule?: number;
  matches?: unknown;
}

function isValidRequestShape(
  body: IngestRequestBody
): body is Required<Pick<IngestRequestBody, "teamId" | "cpNo" | "phase" | "poule">> & {
  matches: unknown;
} {
  return (
    typeof body.teamId === "string" &&
    typeof body.cpNo === "number" &&
    typeof body.phase === "number" &&
    typeof body.poule === "number"
  );
}

function addCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin && (origin.includes("epreuves.fff.fr") || origin.includes("fff.fr"))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  return response;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");

  const user = await getAuthUser(req);
  if (!user) return addCorsHeaders(unauthorized(), origin);

  let body: IngestRequestBody;
  try {
    body = (await req.json()) as IngestRequestBody;
  } catch {
    return addCorsHeaders(NextResponse.json({ error: GENERIC_INVALID_PAYLOAD_MESSAGE }, { status: 400 }), origin);
  }

  if (!isValidRequestShape(body)) {
    return addCorsHeaders(
      NextResponse.json(
        { error: "teamId, cpNo, phase, poule sont requis." },
        { status: 400 }
      ),
      origin
    );
  }

  if (!(await isTeamCoach(user.id, body.teamId))) {
    return addCorsHeaders(forbidden(), origin);
  }

  const triplet: DofaPouleRef = { cp_no: body.cpNo, phase: body.phase, poule: body.poule };
  const rawBody = JSON.stringify(body.matches ?? []);

  const validation = validateIngestPayload({ rawBody, triplet });
  if (!validation.ok) {
    console.error(
      `[dofa/import-from-epreuves] Payload invalide (reason=${validation.reason}): ${validation.message}`
    );
    return addCorsHeaders(NextResponse.json({ error: validation.message }, { status: 400 }), origin);
  }

  const supabase = createAdminClient();

  const { data: championship, error: championshipError } = await supabase
    .from("championships")
    .select("id, last_imported_at, dofa_cl_no, dofa_team_number")
    .eq("team_id", body.teamId)
    .eq("dofa_cp_no", body.cpNo)
    .eq("dofa_phase", body.phase)
    .maybeSingle();

  if (championshipError) {
    return addCorsHeaders(databaseErrorResponse("lecture championnat", championshipError), origin);
  }

  if (!championship) {
    return addCorsHeaders(
      NextResponse.json(
        { error: "Championnat introuvable pour ce triplet de poule." },
        { status: 400 }
      ),
      origin
    );
  }

  if (championship.last_imported_at) {
    const elapsed = Date.now() - new Date(championship.last_imported_at as string).getTime();
    if (elapsed < RATE_LIMIT_WINDOW_MS) {
      return addCorsHeaders(
        NextResponse.json(
          { error: "Un import a déjà eu lieu il y a moins de 60 secondes. Réessayez plus tard." },
          { status: 429 }
        ),
        origin
      );
    }
  }

  const championshipId = championship.id as string;

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("championship_standings")
    .select("dofa_ma_no, event_id, last_imported_kickoff, last_imported_location")
    .eq("championship_id", championshipId);

  if (existingRowsError) {
    return addCorsHeaders(databaseErrorResponse("lecture championship_standings", existingRowsError), origin);
  }

  const existingMaNos = new Set(
    (existingRows ?? []).map((row: { dofa_ma_no: number }) => row.dofa_ma_no)
  );

  const matchUpserts = buildMatchUpserts(validation.matches, championshipId);

  let imported = 0;
  let updated = 0;
  const skipped = validation.undatedMatches.length;

  for (const match of validation.matches) {
    if (existingMaNos.has(match.maNo)) {
      updated += 1;
    } else {
      imported += 1;
    }
  }

  if (matchUpserts.length > 0) {
    const { error: upsertError } = await supabase
      .from("championship_standings")
      .upsert(matchUpserts, { onConflict: "championship_id,dofa_ma_no" });

    if (upsertError) {
      return addCorsHeaders(databaseErrorResponse("upsert matchs", upsertError), origin);
    }
  }

  const standingRows = (existingRows ?? []) as Array<{
    dofa_ma_no: number;
    event_id: string | null;
    last_imported_kickoff: string | null;
    last_imported_location: string | null;
  }>;

  const linkedRows = standingRows.filter((row) => row.event_id);
  const eventIds = linkedRows.map((row) => row.event_id as string);

  let eventsById = new Map<
    string,
    { event_date: string | null; end_date: string | null; location: string | null }
  >();
  let eventIdsWithAttendances = new Set<string>();

  if (eventIds.length > 0) {
    try {
      const { data: eventRows } = await supabase
        .from("events")
        .select("id, event_date, end_date, location")
        .in("id", eventIds);
      for (const ev of eventRows ?? []) {
        eventsById.set(ev.id as string, {
          event_date: ev.event_date as string | null,
          end_date: ev.end_date as string | null,
          location: ev.location as string | null,
        });
      }

      const { data: attRows } = await supabase
        .from("attendances")
        .select("event_id")
        .in("event_id", eventIds);
      for (const att of attRows ?? []) {
        eventIdsWithAttendances.add(att.event_id as string);
      }
    } catch (e) {
      console.error("[dofa/import-from-epreuves] Erreur lecture événements/attendances:", e);
    }
  }

  const existingEventRecords: ExistingEventRecord[] = [];
  for (const row of standingRows) {
    if (row.event_id && eventsById.has(row.event_id)) {
      const ev = eventsById.get(row.event_id)!;
      existingEventRecords.push({
        dofaMaNo: row.dofa_ma_no,
        eventId: row.event_id,
        eventDate: ev.event_date,
        endDate: ev.end_date,
        location: ev.location,
        hasAttendances: eventIdsWithAttendances.has(row.event_id),
        lastImportedKickoff: row.last_imported_kickoff,
        lastImportedLocation: row.last_imported_location,
      });
    }
  }

  const coachTeam = championship.dofa_cl_no && championship.dofa_team_number
    ? { clNo: championship.dofa_cl_no, number: championship.dofa_team_number }
    : null;

  const eventSync = { created: 0, updated: 0, skipped: 0, errors: 0 };

  if (coachTeam) {
    try {
      const actions = planEventSync(validation.matches, existingEventRecords, Date.now(), coachTeam);

      for (const action of actions) {
        if (action.action === "create") {
          const { data: createdEvents, error: createError } = await supabase
            .from("events")
            .insert({
              team_id: body.teamId,
              championship_id: championshipId,
              title: `${action.event.is_home ? "vs" : "@ "} ${action.event.opponent}`,
              type: action.event.type,
              event_date: action.event.event_date,
              location: action.event.location,
              status: "upcoming",
              dofa_ma_no: action.maNo,
            })
            .select("id");
          
          if (createError) {
            console.error("[dofa/import-from-epreuves] Erreur création event:", createError);
            eventSync.errors += 1;
          } else if (createdEvents && createdEvents[0]) {
            await supabase
              .from("championship_standings")
              .update({ event_id: createdEvents[0].id })
              .eq("championship_id", championshipId)
              .eq("dofa_ma_no", action.maNo);
            eventSync.created += 1;
          }
        } else if (action.action === "update") {
          const payload: Record<string, unknown> = {};
          if (action.changes.event_date) payload.event_date = action.changes.event_date;
          if (action.changes.location !== undefined) payload.location = action.changes.location;
          if (Object.keys(payload).length > 0) {
            const { error: updErr } = await supabase.from("events").update(payload).eq("id", action.eventId);
            if (updErr) {
              console.error("[dofa/import-from-epreuves] Erreur MAJ event:", updErr);
              eventSync.errors += 1;
            } else {
              eventSync.updated += 1;
            }
          } else {
            eventSync.skipped += 1;
          }
        } else if (action.action === "skip-locked" || action.action === "noop") {
          eventSync.skipped += 1;
        } else if (action.action === "postpone") {
          eventSync.skipped += 1;
        } else if (action.action === "conflict") {
          eventSync.skipped += 1;
        } else if (action.action === "reschedule-reset-attendances") {
          const { error: updErr } = await supabase
            .from("events")
            .update({ event_date: action.changes.event_date })
            .eq("id", action.eventId);
          if (updErr) {
            console.error("[dofa/import-from-epreuves] Erreur MAJ event (reschedule):", updErr);
            eventSync.errors += 1;
          } else {
            eventSync.updated += 1;
          }
        }
      }
    } catch (e) {
      console.error("[dofa/import-from-epreuves] Exception event-sync:", e);
    }
  }

  try {
    await supabase
      .from("championships")
      .update({ last_imported_at: new Date().toISOString() })
      .eq("id", championshipId);
  } catch (e) {
    console.error("[dofa/import-from-epreuves] Erreur MAJ last_imported_at:", e);
  }

  const response = NextResponse.json({
    imported,
    updated,
    skipped,
    total: validation.matches.length,
    eventSync,
  });

  return addCorsHeaders(response, origin);
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const response = new NextResponse(null, { status: 204 });
  if (origin && (origin.includes("epreuves.fff.fr") || origin.includes("fff.fr"))) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  return response;
}
