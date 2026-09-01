import { NextResponse } from "next/server";
import { getAuthUser, unauthorized, forbidden, isTeamCoach } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateIngestPayload } from "@/lib/dofa/ingest-validation";
import { buildMatchUpserts } from "@/lib/dofa/persist-mapping";
import { planEventSync, type ExistingEventRecord } from "@/lib/dofa/event-sync";
import type { DofaPouleRef, TeamIdentity } from "@/lib/dofa/types";

/**
 * POST /api/championships/dofa/ingest — LOT 7 (endpoint d'ingestion sécurisé)
 *
 * ⚠️ Point le plus sensible du chantier : le payload reçu ici provient d'un
 * collage manuel effectué par le coach (JSON copié depuis le site DOFA),
 * lui-même relayé depuis un site tiers (FFF/DOFA). Rien ne garantit son
 * origine ni son intégrité. Toute la confiance repose sur
 * `validateIngestPayload` (fonction pure, réutilisée telle quelle, jamais
 * mockée).
 *
 * Règles de sécurité de cette route :
 *   - authentification obligatoire (401) ;
 *   - autorisation d'ÉCRITURE réservée au coach de l'équipe visée, via
 *     `isTeamCoach` — JAMAIS `isTeamMember` (403 sinon) ;
 *   - aucun détail interne (stack, SQL, nom de colonne) ne fuite dans les
 *     réponses d'erreur : le détail est loggé côté serveur uniquement ;
 *   - garde-fou de fréquence (429) basé sur `championships.last_imported_at`
 *     (colonne du lot 6), sans dépendance de rate-limiting ;
 *   - ⚠️ RÈGLE D'OR : aucun `DELETE` n'est jamais émis par cette route. Un
 *     payload de matchs vide est un no-op valide (200), jamais une purge.
 *     Absence de matchs dans le lot ≠ suppression des matchs déjà connus.
 */

const RATE_LIMIT_WINDOW_MS = 60_000;

const GENERIC_INVALID_PAYLOAD_MESSAGE =
  "Le payload transmis est invalide. Vérifiez le format des données importées.";

// Erreur côté serveur (base de données) — ne doit JAMAIS être confondue avec
// une erreur de payload : la faute n'est pas celle de l'utilisateur.
const GENERIC_DATABASE_ERROR_MESSAGE =
  "Une erreur serveur est survenue pendant le traitement de l'import. Réessayez plus tard.";

// Cas particulier d'erreur DB : colonne (42703) ou contrainte ON CONFLICT
// (42P10) absente, symptôme typique d'une migration non appliquée. On ne
// révèle jamais le nom de la colonne ni la structure de la base au client.
const MIGRATION_MISSING_MESSAGE =
  "Une erreur serveur est survenue (configuration de la base incomplète). Contactez l'administrateur.";

const MIGRATION_MISSING_PG_CODES = new Set(["42703", "42P10"]);

/**
 * Construit la réponse d'erreur pour un échec Supabase (lecture ou écriture).
 * Toujours un 500 : ce n'est jamais une faute du payload envoyé par le client.
 * Le détail technique (code, message Postgres) est loggé côté serveur
 * uniquement — jamais renvoyé au client.
 */
function databaseErrorResponse(context: string, error: { code?: string; message?: string } | null) {
  console.error(`[dofa/ingest] Erreur Supabase (${context}):`, error);

  if (error?.code && MIGRATION_MISSING_PG_CODES.has(error.code)) {
    console.error(
      `[dofa/ingest] Migration probablement manquante (code=${error.code}, contexte=${context}).`
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

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  let body: IngestRequestBody;
  try {
    body = (await req.json()) as IngestRequestBody;
  } catch {
    return NextResponse.json({ error: GENERIC_INVALID_PAYLOAD_MESSAGE }, { status: 400 });
  }

  if (!isValidRequestShape(body)) {
    return NextResponse.json(
      { error: "teamId, cpNo, phase, poule sont requis." },
      { status: 400 }
    );
  }

  if (!(await isTeamCoach(user.id, body.teamId))) {
    return forbidden();
  }

  const triplet: DofaPouleRef = { cp_no: body.cpNo, phase: body.phase, poule: body.poule };
  const rawBody = JSON.stringify(body.matches ?? []);

  const validation = validateIngestPayload({ rawBody, triplet });
  if (!validation.ok) {
    // Détail complet loggé côté serveur uniquement — jamais renvoyé au client.
    console.error(
      `[dofa/ingest] Payload invalide (reason=${validation.reason}): ${validation.message}`
    );
    return NextResponse.json({ error: GENERIC_INVALID_PAYLOAD_MESSAGE }, { status: 400 });
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
    return databaseErrorResponse("lecture championnat", championshipError);
  }

  if (!championship) {
    return NextResponse.json(
      { error: "Championnat introuvable pour ce triplet de poule." },
      { status: 400 }
    );
  }

  if (championship.last_imported_at) {
    const elapsed = Date.now() - new Date(championship.last_imported_at as string).getTime();
    if (elapsed < RATE_LIMIT_WINDOW_MS) {
      return NextResponse.json(
        { error: "Un import a déjà eu lieu il y a moins de 60 secondes. Réessayez plus tard." },
        { status: 429 }
      );
    }
  }

  const championshipId = championship.id as string;

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("championship_standings")
    .select("dofa_ma_no, event_id, last_imported_kickoff, last_imported_location")
    .eq("championship_id", championshipId);

  if (existingRowsError) {
    return databaseErrorResponse("lecture championship_standings", existingRowsError);
  }

  const existingMaNos = new Set(
    (existingRows ?? []).map((row: { dofa_ma_no: number }) => row.dofa_ma_no)
  );

  const matchUpserts = buildMatchUpserts(validation.matches, championshipId);

  let imported = 0;
  let updated = 0;
  const skipped = 0;

  for (const match of validation.matches) {
    if (existingMaNos.has(match.maNo)) {
      updated += 1;
    } else {
      imported += 1;
    }
  }

  // ⚠️ RÈGLE D'OR : jamais de DELETE ici. Un lot vide (matchUpserts.length
  // === 0) produit simplement... aucun appel d'écriture : c'est un no-op
  // strict, pas une purge des matchs déjà en base.
  if (matchUpserts.length > 0) {
    const { error: upsertError } = await supabase
      .from("championship_standings")
      .upsert(matchUpserts, { onConflict: "championship_id,dofa_ma_no" });

    if (upsertError) {
      return databaseErrorResponse("upsert matchs", upsertError);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // LOT 9 — synchronisation de l'agenda (`events`/`attendances`)
  //
  // `planEventSync` (fonction pure, src/lib/dofa/event-sync.ts) a déjà
  // DÉCIDÉ des actions à appliquer. Ce bloc se contente d'EXÉCUTER un plan
  // déjà validé, sans aucune décision métier supplémentaire.
  //
  // ⚠️ Chaque action est appliquée dans son propre try/catch : l'échec
  // isolé d'une action (ex. contrainte DB inattendue) ne doit jamais faire
  // échouer tout le lot ni les autres écritures déjà réalisées plus haut
  // (championship_standings). L'erreur est loggée côté serveur et comptée
  // dans `eventSync.errors`, jamais renvoyée en détail au client.
  //
  // 🔒 Aucun DELETE n'est jamais émis ici, sur aucune table.
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

      eventsById = new Map(
        (eventRows ?? []).map(
          (e: { id: string; event_date: string | null; end_date: string | null; location: string | null }) => [
            e.id,
            { event_date: e.event_date, end_date: e.end_date, location: e.location },
          ]
        )
      );

      const { data: attendanceRows } = await supabase
        .from("attendances")
        .select("event_id")
        .in("event_id", eventIds);

      eventIdsWithAttendances = new Set(
        (attendanceRows ?? []).map((a: { event_id: string }) => a.event_id)
      );
    } catch (err) {
      console.error("[dofa/ingest] Erreur lecture events/attendances (event-sync):", err);
    }
  }

  const existingEventRecords: ExistingEventRecord[] = linkedRows
    .map((row) => {
      const eventId = row.event_id as string;
      const event = eventsById.get(eventId);
      if (!event) return null;
      return {
        dofaMaNo: row.dofa_ma_no,
        eventId,
        eventDate: event.event_date,
        endDate: event.end_date,
        location: event.location,
        hasAttendances: eventIdsWithAttendances.has(eventId),
        lastImportedKickoff: row.last_imported_kickoff,
        lastImportedLocation: row.last_imported_location,
      };
    })
    .filter((r): r is ExistingEventRecord => r !== null);

  const coachTeam: TeamIdentity = {
    clNo: championship.dofa_cl_no as number,
    number: championship.dofa_team_number as number,
  };

  const plan = planEventSync(validation.matches, existingEventRecords, Date.now(), coachTeam);

  const eventSync = {
    created: 0,
    updated: 0,
    noop: 0,
    conflict: 0,
    skippedLocked: 0,
    postponed: 0,
    rescheduledResetAttendances: 0,
    errors: 0,
  };

  for (const action of plan) {
    try {
      switch (action.action) {
        case "create": {
          const { data: inserted, error: insertError } = await supabase
            .from("events")
            .insert({
              team_id: body.teamId,
              type: action.event.type,
              title: `Match vs ${action.event.opponent}`,
              event_date: action.event.event_date,
              opponent: action.event.opponent,
              location: action.event.location,
              created_by: user.id,
            })
            .select("id")
            .single();

          if (insertError || !inserted) {
            throw insertError ?? new Error("Insertion d'événement sans résultat");
          }

          await supabase
            .from("championship_standings")
            .update({
              event_id: (inserted as { id: string }).id,
              last_imported_kickoff: action.event.event_date,
              last_imported_location: action.event.location,
            })
            .eq("championship_id", championshipId)
            .eq("dofa_ma_no", action.maNo);

          eventSync.created += 1;
          break;
        }

        case "update": {
          if (Object.keys(action.changes).length > 0) {
            await supabase.from("events").update(action.changes).eq("id", action.eventId);
          }

          const standingsPatch: Record<string, unknown> = {};
          if (action.changes.event_date !== undefined) {
            standingsPatch.last_imported_kickoff = action.changes.event_date;
          }
          if (action.changes.location !== undefined) {
            standingsPatch.last_imported_location = action.changes.location;
          }
          if (Object.keys(standingsPatch).length > 0) {
            await supabase
              .from("championship_standings")
              .update(standingsPatch)
              .eq("championship_id", championshipId)
              .eq("dofa_ma_no", action.maNo);
          }

          eventSync.updated += 1;
          break;
        }

        case "reschedule-reset-attendances": {
          await supabase
            .from("events")
            .update({ event_date: action.changes.event_date })
            .eq("id", action.eventId);

          // Invalidation des convocations existantes : on les repasse en
          // `pending` (alignement sur l'état "en attente de réponse"
          // manipulé par ensureAttendanceRows/convocations.ts, plutôt que
          // d'inventer un nouveau statut). Les joueurs seront resollicités.
          await supabase
            .from("attendances")
            .update({ status: "pending", absence_reason: null, responded_at: null })
            .eq("event_id", action.eventId);

          await supabase
            .from("championship_standings")
            .update({ last_imported_kickoff: action.changes.event_date })
            .eq("championship_id", championshipId)
            .eq("dofa_ma_no", action.maNo);

          eventSync.rescheduledResetAttendances += 1;
          break;
        }

        case "postpone": {
          // Marquage du report déjà porté par `championship_standings.postponed`
          // (cf. buildMatchUpserts, upserté plus haut) — aucune écriture
          // supplémentaire sur `events` : jamais de suppression.
          eventSync.postponed += 1;
          break;
        }

        case "skip-locked": {
          eventSync.skippedLocked += 1;
          break;
        }

        case "conflict": {
          eventSync.conflict += 1;
          break;
        }

        case "noop": {
          eventSync.noop += 1;
          break;
        }
      }
    } catch (err) {
      console.error(
        `[dofa/ingest] Erreur d'application du plan event-sync (action=${action.action}, maNo=${action.maNo}):`,
        err
      );
      eventSync.errors += 1;
    }
  }

  await supabase
    .from("championships")
    .update({ last_imported_at: new Date().toISOString() })
    .eq("id", championshipId);

  return NextResponse.json({ imported, updated, skipped, source: "dofa_import", eventSync });
}
