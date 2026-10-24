import "server-only";

import { EXERCISES_BANK } from "@/lib/data/exercises-bank";
import { DRILL_TYPES, type DrillType } from "@/lib/training/exercises";

export interface BankExercise {
  id: string;
  titre: string;
  type: DrillType;
  tranche_age: string;
  duree: string;
  explications: string;
}

const VALID_TYPES = new Set<string>(DRILL_TYPES);

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Certains doublons de la banque source portent des ids différents mais le même titre.
const seenTitles = new Set<string>();
const BANK: BankExercise[] = [];
for (const e of EXERCISES_BANK) {
  if (!VALID_TYPES.has(e.type)) continue;
  const key = normalizeKey(e.titre);
  if (seenTitles.has(key)) continue;
  seenTitles.add(key);
  BANK.push({
    id: e.id,
    titre: e.titre,
    type: e.type as DrillType,
    tranche_age: e.tranche_age,
    duree: e.duree,
    explications: e.explications,
  });
}

/** Pioche aléatoire dédoublonnée dans la banque, en couvrant au moins un exercice par type du pool. */
export function sampleExerciseBank(count: number, types: readonly DrillType[]): BankExercise[] {
  const picked: BankExercise[] = [];
  const usedIds = new Set<string>();
  const pick = (candidates: BankExercise[]) => {
    if (candidates.length === 0) return null;
    const e = candidates[Math.floor(Math.random() * candidates.length)];
    usedIds.add(e.id);
    picked.push(e);
    return e;
  };
  for (const t of types) {
    if (picked.length >= count) break;
    pick(BANK.filter((e) => e.type === t && !usedIds.has(e.id)));
  }
  while (picked.length < count) {
    const before = picked.length;
    pick(BANK.filter((e) => !usedIds.has(e.id)));
    if (picked.length === before) break; // banque épuisée
  }
  return picked;
}

/** Liste formatée pour injection dans un prompt IA. */
export function formatExerciseBank(exercises: BankExercise[]): string {
  return exercises
    .map((e, i) => `${i + 1}. [${e.type} · ${e.duree}] ${e.titre} — ${e.explications}`)
    .join("\n");
}

/** Pool de types pertinent pour une phase de séance. */
export function exerciseTypesForPhase(phase: string): DrillType[] {
  if (phase === "ATHLETISATION") return ["échauffement", "physique", "physique", "jeu"];
  return ["échauffement", "technique", "tactique", "jeu"];
}
