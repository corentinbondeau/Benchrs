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
  {
    type: "relance",
    label: "Relances cotisation",
    description: "Relance de paiement de cotisation envoyée par le coach",
  },
  {
    type: "echeance",
    label: "Échéances (licence, certificat)",
    description: "Alerte quand une licence ou un certificat médical arrive à expiration",
  },
  {
    type: "bilan_trimestriel",
    label: "Bilan trimestriel",
    description: "Bilan IA de progression envoyé par le coach",
  },
  {
    type: "felicitation",
    label: "Félicitations",
    description: "Anniversaires, premiers buts et capes marquantes",
  },
  {
    type: "relance_convocation",
    label: "Relance de convocation",
    description: "Rappel quand tu n'as pas répondu à une convocation",
  },
  {
    type: "equite_temps_jeu",
    label: "Équité du temps de jeu",
    description: "Alerte aux coachs sur les joueurs sous leur objectif de minutes",
  },
  {
    type: "terrain_impraticable",
    label: "Terrain impraticable",
    description: "Match ou entraînement annulé pour cause de terrain",
  },
  {
    type: "reunion",
    label: "Réunions parents",
    description: "Convocations et comptes-rendus de réunions parents",
  },
  {
    type: "cagnotte",
    label: "Cagnotte",
    description: "Contributions et relances de la cagnotte d'équipe",
  },
  {
    type: "recuperation",
    label: "Routine de récupération",
    description: "Protocole de récupération post-match envoyé par le coach",
  },
  {
    type: "newsletter",
    label: "Newsletter du club",
    description: "Newsletter mensuelle générée par le club",
  },
  {
    type: "voeux",
    label: "Vœux de fin de saison",
    description: "Carte personnalisée de fin de saison",
  },
  {
    type: "suspension",
    label: "Discipline",
    description: "Alertes cartons et suspensions",
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
