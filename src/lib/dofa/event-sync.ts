/**
 * event-sync.ts — LOT 9 (synchronisation des matchs importés vers l'agenda)
 *
 * ⚠️ Zone de régression la plus risquée du chantier DOFA : touche `events`,
 * donc potentiellement les convocations (`attendances`) et le verrouillage
 * des événements passés (`src/lib/event-lock.ts`).
 *
 * `planEventSync` est une fonction PURE : aucune I/O, aucun appel Supabase,
 * aucune mutation. Elle se contente de DÉCIDER des actions à partir de son
 * entrée ; l'exécuteur (route d'ingestion) se contente d'appliquer un plan
 * déjà validé. Aucune décision métier ne doit se trouver dans l'exécuteur.
 *
 * Voir `src/lib/dofa/__tests__/event-sync.test.ts` pour le contrat complet
 * et les priorités entre règles (verrouillées par les tests) :
 *   1. `skip-locked` prime sur tout ;
 *   2. `conflict` prime sur `reschedule-reset-attendances` et `update` ;
 *   3. `postpone` prime sur `update`, `reschedule-reset-attendances` et `noop` ;
 *   4. `reschedule-reset-attendances` prime sur `update` si convocations
 *      existantes ET date modifiée ;
 *   5. `noop` seulement si rien n'a changé.
 */

import { isEventLocked } from "@/lib/event-lock";
import type { DofaMatch } from "./parse-matches";
import type { TeamIdentity } from "./types";

/** État actuel d'un événement déjà lié à un match importé (miroir `championship_standings` + `events`). */
export interface ExistingEventRecord {
  /** Clé d'idempotence, miroir `championship_standings.dofa_ma_no`. */
  dofaMaNo: number;
  eventId: string;
  /** Valeur ACTUELLE en base (table `events`). */
  eventDate: string | null;
  /** Pour `isEventLocked`. */
  endDate: string | null;
  /** Valeur ACTUELLE en base (table `events`). */
  location: string | null;
  hasAttendances: boolean;
  /** Dernière valeur ÉCRITE par l'import précédent. */
  lastImportedKickoff: string | null;
  /** Idem, pour le lieu. */
  lastImportedLocation: string | null;
}

export type EventSyncAction =
  | {
      action: "create";
      maNo: number;
      event: {
        type: "match";
        event_date: string;
        opponent: string;
        location: string | null;
      };
    }
  | {
      action: "update";
      maNo: number;
      eventId: string;
      changes: { event_date?: string; location?: string | null };
    }
  | { action: "noop"; maNo: number; eventId: string }
  | { action: "conflict"; maNo: number; eventId: string; reason: string }
  | { action: "skip-locked"; maNo: number; eventId: string }
  | { action: "postpone"; maNo: number; eventId: string | null }
  | {
      action: "reschedule-reset-attendances";
      maNo: number;
      eventId: string;
      changes: { event_date: string };
    };

/** Concatène le lieu d'un match (`name, address, city`) — champs absents omis. */
function buildLocationString(match: DofaMatch): string | null {
  if (!match.location) return null;
  return [match.location.name, match.location.address, match.location.city]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

/** Adversaire du coach : identité par `cl_no` + `number`, jamais par le nom. */
function resolveOpponentName(match: DofaMatch, coachTeam: TeamIdentity): string {
  const isHomeCoach =
    match.homeTeam.clNo === coachTeam.clNo && match.homeTeam.number === coachTeam.number;
  return isHomeCoach ? match.awayTeam.shortName : match.homeTeam.shortName;
}

/** L'équipe du coach est-elle engagée dans ce match (home OU away) ? Identité stricte `clNo` + `number` (jamais `clNo` seul — deux équipes du même club portent des `number` différents). */
function isCoachMatch(match: DofaMatch, coachTeam: TeamIdentity): boolean {
  const isHome =
    match.homeTeam.clNo === coachTeam.clNo && match.homeTeam.number === coachTeam.number;
  const isAway =
    match.awayTeam.clNo === coachTeam.clNo && match.awayTeam.number === coachTeam.number;
  return isHome || isAway;
}

export function planEventSync(
  matches: DofaMatch[],
  existingEvents: ExistingEventRecord[],
  now: number,
  coachTeam: TeamIdentity
): EventSyncAction[] {
  const existingByMaNo = new Map(existingEvents.map((e) => [e.dofaMaNo, e]));

  const actions: EventSyncAction[] = [];

  for (const match of matches) {
    // Seuls les matchs où l'équipe du coach est engagée (home OU away)
    // alimentent l'agenda — le classement (standings.ts) continue
    // d'utiliser tous les matchs de la poule, hors-scope ici.
    if (!isCoachMatch(match, coachTeam)) continue;

    const existing = existingByMaNo.get(match.maNo);

    if (!existing) {
      // Aucun événement lié : report éventuel n'empêche pas la création,
      // mais un report n'a pas besoin d'événement → `postpone` avec eventId null.
      if (match.seemsPostponed) {
        actions.push({ action: "postpone", maNo: match.maNo, eventId: null });
        continue;
      }

      actions.push({
        action: "create",
        maNo: match.maNo,
        event: {
          type: "match",
          event_date: match.kickoff ?? match.date,
          opponent: resolveOpponentName(match, coachTeam),
          location: buildLocationString(match),
        },
      });
      continue;
    }

    // 1. `skip-locked` prime sur tout : aucune écriture sur un événement verrouillé.
    // Le verrouillage se base sur la DERNIÈRE VALEUR IMPORTÉE (reflet fiable
    // du calendrier réel du match), pas sur `eventDate` actuel qui peut avoir
    // été modifié manuellement (et pointer vers un futur fictif) : un match
    // déjà joué reste verrouillé même si le coach a ensuite retapé une date.
    if (isEventLocked(existing.lastImportedKickoff, existing.endDate, now)) {
      actions.push({ action: "skip-locked", maNo: match.maNo, eventId: existing.eventId });
      continue;
    }

    // Détection d'une saisie manuelle : la valeur ACTUELLE diverge de la
    // DERNIÈRE VALEUR ÉCRITE par l'import précédent → le coach a modifié à
    // la main depuis. `events.updated_at` n'est jamais utilisé (inexploitable).
    const dateModifiedManually = existing.eventDate !== existing.lastImportedKickoff;
    const locationModifiedManually = existing.location !== existing.lastImportedLocation;

    // 2. `conflict` prime sur `reschedule-reset-attendances` et `update`.
    if (dateModifiedManually || locationModifiedManually) {
      const reasons: string[] = [];
      if (dateModifiedManually) reasons.push("date modifiée manuellement");
      if (locationModifiedManually) reasons.push("lieu modifié manuellement");
      actions.push({
        action: "conflict",
        maNo: match.maNo,
        eventId: existing.eventId,
        reason: reasons.join(", "),
      });
      continue;
    }

    // 3. `postpone` prime sur `update`/`reschedule-reset-attendances`/`noop`.
    if (match.seemsPostponed) {
      actions.push({ action: "postpone", maNo: match.maNo, eventId: existing.eventId });
      continue;
    }

    const newKickoff = match.kickoff ?? match.date;
    const newLocation = buildLocationString(match);

    const dateChanged = newKickoff !== existing.eventDate;
    const locationChanged = newLocation !== existing.location;

    if (!dateChanged && !locationChanged) {
      // 5. `noop` uniquement si rien n'a changé.
      actions.push({ action: "noop", maNo: match.maNo, eventId: existing.eventId });
      continue;
    }

    // 4. `reschedule-reset-attendances` prime sur `update` si convocations
    // existantes ET date modifiée.
    if (existing.hasAttendances && dateChanged) {
      actions.push({
        action: "reschedule-reset-attendances",
        maNo: match.maNo,
        eventId: existing.eventId,
        changes: { event_date: newKickoff ?? "" },
      });
      continue;
    }

    const changes: { event_date?: string; location?: string | null } = {};
    if (dateChanged && newKickoff) changes.event_date = newKickoff;
    if (locationChanged) changes.location = newLocation;

    actions.push({ action: "update", maNo: match.maNo, eventId: existing.eventId, changes });
  }

  // Anti-régression capitale : un match présent dans `existingEvents` mais
  // absent de `matches` NE PRODUIT AUCUNE ACTION — absence ≠ annulation,
  // jamais de suppression.

  return actions;
}
