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
  {
    type: "physical",
    label: "Données physiques (VMA/VMI)",
    description: "Mise à jour de ta VMA ou de ta VMI par le coach",
  },
  {
    type: "match_retour",
    label: "Retour de match",
    description: "Note et commentaire du coach après un match",
  },
  {
    type: "match_report",
    label: "Compte-rendu de match",
    description: "Compte-rendu IA du match publié par le coach",
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
