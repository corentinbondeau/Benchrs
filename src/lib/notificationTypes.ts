export interface NotificationTypeConfig {
  type: string;
  label: string;
  description: string;
}

export const NOTIFICATION_TYPES: NotificationTypeConfig[] = [
  {
    type: "convocation",
    label: "Convocations",
    description: "Convocations aux entraînements et matchs",
  },
  {
    type: "resultat",
    label: "Résultats de match",
    description: "Résultats et statistiques des matchs",
  },
  {
    type: "message",
    label: "Messages",
    description: "Nouveaux messages dans la messagerie",
  },
  {
    type: "rappel",
    label: "Rappels",
    description: "Rappels avant un événement",
  },
];

export function defaultNotificationPrefs(userId: string, teamId: string) {
  return NOTIFICATION_TYPES.map((t) => ({
    user_id: userId,
    team_id: teamId,
    type: t.type,
    push_enabled: true,
    email_enabled: true,
  }));
}
