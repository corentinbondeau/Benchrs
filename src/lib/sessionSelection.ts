// Logique pure : sélection de la dernière séance d'entraînement passée
// éligible pour un joueur, afin de lui proposer directement le RPE et
// l'analyse de séance sur son accueil.
//
// Règles métier (voir src/lib/__tests__/lastSession.test.ts) :
//   - Seuls les events `type: "training"` sont éligibles.
//   - Seules les séances passées comptent : `event_date + EVENT_LOCK_GRACE_MS < now`.
//   - Une séance `status: "cancelled"` est ignorée.
//   - Parmi les séances éligibles, on retient la plus récente (event_date).
//   - Présence : une ligne attendances pour ce joueur ne rend la séance
//     proposable que si son statut est "present" ou "late". Sinon => null.
//   - Absence de ligne attendances pour ce joueur => comportement permissif.
//   - On ne "retombe" jamais sur une séance antérieure : seule LA dernière
//     séance passée est considérée.

import { EVENT_LOCK_GRACE_MS } from "@/lib/event-lock";

export interface LastSessionEvent {
  id: string;
  type: string;
  event_date: string;
  status?: string | null;
}

export interface LastSessionAttendance {
  event_id: string;
  user_id: string;
  status?: string | null;
}

export interface SelectLastSessionParams {
  events: LastSessionEvent[];
  attendances: LastSessionAttendance[];
  playerId: string;
  now?: number;
}

const ELIGIBLE_ATTENDANCE_STATUSES = new Set(["present", "late"]);

export function selectLastSession({
  events,
  attendances,
  playerId,
  now = Date.now(),
}: SelectLastSessionParams): string | null {
  const eligible = events
    .filter((e) => e.type === "training")
    .filter((e) => e.status !== "cancelled")
    .filter((e) => {
      const time = new Date(e.event_date).getTime();
      if (Number.isNaN(time)) return false;
      return time + EVENT_LOCK_GRACE_MS < now;
    })
    .sort(
      (a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
    );

  const last = eligible[0];
  if (!last) return null;

  const attendance = attendances.find(
    (a) => a.event_id === last.id && a.user_id === playerId
  );

  if (!attendance) return last.id;

  return ELIGIBLE_ATTENDANCE_STATUSES.has(attendance.status ?? "") ? last.id : null;
}

// ---------------------------------------------------------------------------
// selectNextSession — check-in de forme AVANT la séance
// ---------------------------------------------------------------------------
//
// Règles métier (voir src/lib/__tests__/sessionSelection.test.ts) :
//   - Seuls les events `type: "training"` sont éligibles.
//   - Seules les séances à venir comptent : `event_date > now`.
//   - Fenêtre de 24h : la séance doit avoir lieu dans les CHECK_IN_WINDOW_MS.
//   - Une séance `status: "cancelled"` est ignorée.
//   - Parmi les séances éligibles, on retient la plus proche (event_date).
//   - Présence : contrairement à selectLastSession, "pending" est ÉLIGIBLE.
//     Seuls "absent" et "excused" excluent la séance.
//   - Absence de ligne attendances pour ce joueur => comportement permissif.

export const CHECK_IN_WINDOW_MS = 24 * 60 * 60 * 1000;

const EXCLUDED_ATTENDANCE_STATUSES = new Set(["absent", "excused"]);

export interface SelectNextSessionParams {
  events: LastSessionEvent[];
  attendances: LastSessionAttendance[];
  playerId: string;
  now?: number;
}

export function selectNextSession({
  events,
  attendances,
  playerId,
  now = Date.now(),
}: SelectNextSessionParams): string | null {
  const eligible = events
    .filter((e) => e.type === "training")
    .filter((e) => e.status !== "cancelled")
    .filter((e) => {
      const time = new Date(e.event_date).getTime();
      if (Number.isNaN(time)) return false;
      return time > now && time - now <= CHECK_IN_WINDOW_MS;
    })
    .sort(
      (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );

  const next = eligible[0];
  if (!next) return null;

  const attendance = attendances.find(
    (a) => a.event_id === next.id && a.user_id === playerId
  );

  if (!attendance) return next.id;

  return EXCLUDED_ATTENDANCE_STATUSES.has(attendance.status ?? "") ? null : next.id;
}
