// Types et constantes partagés (client + serveur).
// La génération IA de séances vit dans "@/lib/training/session-generator" (server-only),
// alimentée par la banque d'exercices "@/lib/training/exercise-bank".

export interface FicheBlock {
  label: string;
  text: string;
}

export type SchematicType = "pitch" | "zones" | "grid" | "circle" | "corridor" | "line" | "none";

export interface Schematic {
  type: SchematicType;
  dimensions: string;
  players: string;
  description: string;
}

export interface FicheSection {
  name: string;
  duration: number;
  items: FicheBlock[];
  variants: string[];
  schematic: Schematic | null;
  animation?: string;
}

export interface AISession {
  title: string;
  phase: string;
  objective: string;
  material: string;
  totalDuration: number;
  sections: FicheSection[];
  conseilsCoach: string[];
}

export const FOOTBALL_SYSTEMS = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "5-3-2"] as const;
export type FootballSystem = (typeof FOOTBALL_SYSTEMS)[number];

export const EXPERTISE_LEVELS = ["BMF", "BE", "UEFA B", "UEFA A"] as const;
export type ExpertiseLevel = (typeof EXPERTISE_LEVELS)[number];
