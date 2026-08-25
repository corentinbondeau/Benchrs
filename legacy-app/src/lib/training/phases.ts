export const TACTICAL_PHASES: Record<string, string[]> = {
  "DÉSEQUILIBRER / FINIR": [
    "Jeu combiné pour créer le surnombre",
    "Jouer à l'opposé après avoir fixer",
    "Rechercher joueur lancé dans la profondeur",
    "Se démarquer, éliminer passer ou tirer face à une défense en place",
    "Se démarquer, éliminer passer ou tirer face à une défense en crise",
  ],
  "CONSERVER / PROGRESSER": [
    "Créer et utiliser des espaces",
    "Jouer dans les intervalles et entre les lignes",
    "Jouer combiné à 2 / à 3 créer de la mobilité et de la vitesse de circulation",
  ],
  "S’OPPOSER À LA PROGRESSION": [
    "Freiner la progression / réorganiser les alignements",
    "Anticiper la profondeur",
    "Protéger l'axe, le couloir de jeu direct, organiser les prises en charge",
  ],
  "S’ORGANISER POUR RECUPERER": [
    "S'organiser en déséquilibre",
    "Densifier dans le couloir de jeu",
    "Couvrir le partenaire dans l'action défensive",
  ],
  ATHLETISATION: [
    "Entretenir la condition physique acquise lors de la préparation physique (2-3 semaines)",
    "Développer l'endurance de base (filière aérobie)",
    "Renforcer la musculature globale (prévention des blessures)",
    "Améliorer la mobilité, la souplesse et la coordination",
    "Maintenir un niveau physique régulier sans risque de surentraînement",
  ],
};

export const TACTICAL_PHASE_NAMES = Object.keys(TACTICAL_PHASES);
