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
