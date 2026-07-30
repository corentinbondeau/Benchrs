export type Phase = "recreation" | "perfectionnement" | "competition" | "preparation" | "recuperation";

export const PHASES: { value: Phase; label: string }[] = [
  { value: "recreation", label: "Récréation" },
  { value: "perfectionnement", label: "Perfectionnement" },
  { value: "competition", label: "Compétition" },
  { value: "preparation", label: "Préparation physique" },
  { value: "recuperation", label: "Récupération" },
];

export const PHASE_OBJECTIVES: Record<Phase, string[]> = {
  recreation: ["Cohésion", "Jeu", "Technique"],
  perfectionnement: ["Technique", "Tactique", "Physique"],
  competition: ["Tactique", "Physique", "Leadership"],
  preparation: ["Physique", "Endurance", "Force"],
  recuperation: ["Récupération", "Mobilité", "Étirements"],
};

export const THEMES: Record<Phase, string[]> = {
  recreation: ["Jeu libre", "Petits jeux", "Technique de base", "Coordination", "Motricité"],
  perfectionnement: ["Contrôle de balle", "Passes", "Tirs", "Dribbles", "Défense"],
  competition: ["Mise en place tactique", "Transition", "Pressing", "Attaque placée", "Coups de pied arrêtés"],
  preparation: ["VMA", "Fractionné", "Renforcement", "Pliométrie", "Gainage"],
  recuperation: ["Footing léger", "Étirements", "Mobilité articulaire", "Bains froids", "Auto-massage"],
};

interface Exercise {
  name: string;
  duration: number;
  description: string;
  drill_type: string;
}

interface GeneratedSession {
  title: string;
  phase: string;
  objectives: string[];
  exercises: Exercise[];
  totalDuration: number;
}

const EXERCISE_TEMPLATES: Record<string, { name: string; description: string; defaultDuration: number }[]> = {
  recreation: [
    { name: "Jeu du carré magique", description: "Jeu de conservation en 4 zones", defaultDuration: 12 },
    { name: "Tournoi de tirs", description: "Ateliers de tirs par équipes", defaultDuration: 15 },
    { name: "Passe à 10", description: "Jeu de conservation avec objectif de 10 passes consécutives", defaultDuration: 12 },
    { name: "Petit pont", description: "Jeu 1c1 avec objectif de faire passer le ballon entre les jambes", defaultDuration: 10 },
    { name: "Épervier", description: "Jeu de poursuite pour l'échauffement ludique", defaultDuration: 8 },
  ],
  perfectionnement: [
    { name: "Atelier conduite de balle", description: "Parcours de cônes avec changements de direction", defaultDuration: 12 },
    { name: "Exercice de passes", description: "Travail des passes courtes et longues en mouvement", defaultDuration: 12 },
    { name: "Situation de tirs", description: "Enchaînement passe-tir avec finition", defaultDuration: 15 },
    { name: "1c1 défensif", description: "Exercice de duel défensif avec transition offensive", defaultDuration: 12 },
    { name: "Jeu réduit 4c4", description: "Jeu sur petit terrain pour travailler la conservation", defaultDuration: 15 },
  ],
  competition: [
    { name: "Mise en place tactique", description: "Travail du système de jeu et des déplacements", defaultDuration: 20 },
    { name: "Transition attaque-défense", description: "Enchaînement rapide attaque défense à la perte du ballon", defaultDuration: 15 },
    { name: "Pressing organisé", description: "Travail du pressing par vagues", defaultDuration: 15 },
    { name: "Attaque placée", description: "Combinaisons offensives face à un bloc bas", defaultDuration: 20 },
    { name: "Situation de match", description: "Jeu en 8c8 avec consignes tactiques", defaultDuration: 25 },
  ],
  preparation: [
    { name: "Fractionné VMA", description: "30s/30s à 100-120% VMA", defaultDuration: 15 },
    { name: "Renforcement musculaire", description: "Circuit training poids du corps", defaultDuration: 15 },
    { name: "Pliométrie", description: "Sauts, bonds et explosivité", defaultDuration: 12 },
    { name: "Gainage", description: "Exercices de gainage dynamique", defaultDuration: 10 },
    { name: "Course fractionnée", description: "Fractionné long pour l'endurance", defaultDuration: 20 },
  ],
  recuperation: [
    { name: "Footing léger", description: "Course à allure modérée 60% FCM", defaultDuration: 15 },
    { name: "Étirements passifs", description: "Étirements des groupes musculaires sollicités", defaultDuration: 12 },
    { name: "Mobilité articulaire", description: "Travail de mobilité des hanches, chevilles et épaules", defaultDuration: 10 },
    { name: "Auto-massage", description: "Utilisation de rouleaux de massage", defaultDuration: 10 },
    { name: "Exercices de respiration", description: "Techniques de respiration et retour au calme", defaultDuration: 8 },
  ],
};

function pick<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function generateSession(
  phase: Phase,
  themes: string[],
  playerCount: number
): GeneratedSession {
  const templates = EXERCISE_TEMPLATES[phase] || EXERCISE_TEMPLATES.perfectionnement;
  const phaseLabel = PHASES.find((p) => p.value === phase)?.label || phase;
  const themeLabel = themes.length > 0 ? themes.join(" + ") : phaseLabel;

  const exerciseCount = playerCount <= 8 ? 3 : playerCount <= 14 ? 4 : 5;
  const selectedExercises = pick(templates, Math.min(exerciseCount, templates.length));

  const exercises: Exercise[] = selectedExercises.map((t) => ({
    name: t.name,
    duration: t.defaultDuration - (playerCount <= 8 ? 2 : 0) + (playerCount >= 16 ? 3 : 0),
    description: t.description,
    drill_type: phase === "preparation" ? "physical" : phase === "recuperation" ? "recovery" : "technical",
  }));

  const totalDuration = exercises.reduce((sum, e) => sum + e.duration, 0);

  const objectives = themes.length > 0 ? themes : PHASE_OBJECTIVES[phase].slice(0, 2);

  return {
    title: `Séance ${phaseLabel} — ${themeLabel}`,
    phase: phaseLabel,
    objectives,
    exercises,
    totalDuration,
  };
}
