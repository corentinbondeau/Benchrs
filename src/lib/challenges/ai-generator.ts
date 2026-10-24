// Types partagés (client + serveur) pour les défis hebdomadaires.
// La génération IA vit dans "@/lib/challenges/challenge-generator" (server-only),
// alimentée par la banque de défis "@/lib/challenges/challenge-bank".

export const CHALLENGE_DIFFICULTIES = ["facile", "moyen", "difficile"] as const;

export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number];

export interface WeeklyChallenge {
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
}
