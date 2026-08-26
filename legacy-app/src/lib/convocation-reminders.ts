/**
 * Logique pure pour le bouton « Relancer tous » (convocations en attente).
 *
 * Regroupe, par évènement, les destinataires (joueurs + parents liés) à
 * relancer car ils n'ont pas encore répondu à leur convocation. Aucun accès
 * réseau ni React ici : uniquement des transformations de données.
 */

import { isEventLocked } from "@/lib/event-lock";

export interface ReminderEvent {
  id: string;
  title: string;
  type: "match" | "training";
  event_date: string;
  end_date: string | null;
}

export interface ReminderAttendance {
  event_id: string;
  user_id: string;
  status: string | null;
}

export interface ReminderParentLink {
  parent_id: string;
  student_id: string;
}

export interface ReminderTarget {
  event: ReminderEvent;
  userIds: string[];
}

const RESPONDED_STATUSES = new Set(["present", "absent", "late", "excused"]);

function isPending(status: string | null): boolean {
  return status === null || status === "pending" || !RESPONDED_STATUSES.has(status);
}

/**
 * Regroupe par évènement les destinataires (joueurs en attente + parents
 * liés, sans doublon) à relancer. Les évènements verrouillés
 * (`isEventLocked`) sont exclus, de même que les évènements sans aucun
 * destinataire restant en attente.
 */
export function groupRemindersByEvent({
  events,
  attendances,
  parentLinks,
  now,
}: {
  events: ReminderEvent[];
  attendances: ReminderAttendance[];
  parentLinks: ReminderParentLink[];
  now?: number;
}): ReminderTarget[] {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  const results: ReminderTarget[] = [];

  for (const event of events) {
    if (isEventLocked(event.event_date, event.end_date, now)) continue;

    const pendingPlayerIds = attendances
      .filter((a) => a.event_id === event.id && eventsById.has(a.event_id) && isPending(a.status))
      .map((a) => a.user_id);

    if (pendingPlayerIds.length === 0) continue;

    const userIds: string[] = [...pendingPlayerIds];
    const seenParents = new Set<string>();

    for (const playerId of pendingPlayerIds) {
      const linkedParents = parentLinks.filter((l) => l.student_id === playerId);
      for (const link of linkedParents) {
        if (!seenParents.has(link.parent_id)) {
          seenParents.add(link.parent_id);
          userIds.push(link.parent_id);
        }
      }
    }

    results.push({ event, userIds });
  }

  return results;
}

/**
 * Compte le nombre total de joueurs (hors parents) encore en attente, tous
 * évènements confondus. Un même joueur en attente sur plusieurs évènements
 * compte une fois par évènement (pas de dédoublonnage global).
 */
export function countPendingPlayers(
  targets: ReminderTarget[],
  attendances: ReminderAttendance[]
): number {
  let count = 0;
  for (const target of targets) {
    count += attendances.filter(
      (a) => a.event_id === target.event.id && isPending(a.status)
    ).length;
  }
  return count;
}
