import "server-only";

import { CHALLENGES_BANK, type RawChallengeEntry } from "@/lib/data/challenges-bank";
import type { ChallengeDifficulty } from "@/lib/challenges/ai-generator";

export interface BankChallenge {
  titre: string;
  explication: string;
  difficulte: string;
}

/** Mapping difficulté app → libellé de la banque de contenus. */
const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = {
  facile: "facile",
  moyen: "normale",
  difficile: "dur",
};

const BANK_BY_DIFFICULTY: Record<ChallengeDifficulty, BankChallenge[]> = {
  facile: [],
  moyen: [],
  difficile: [],
};

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const seenKeys = new Set<string>();
for (const e of CHALLENGES_BANK as RawChallengeEntry[]) {
  for (const [appDiff, bankDiff] of Object.entries(DIFFICULTY_LABELS)) {
    if (e.difficulte === bankDiff && e.titre && e.explication) {
      const key = `${appDiff}:${normalizeKey(e.titre)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      BANK_BY_DIFFICULTY[appDiff as ChallengeDifficulty].push({
        titre: e.titre,
        explication: e.explication,
        difficulte: e.difficulte,
      });
    }
  }
}

/** Pioche aléatoire de défis de la banque pour une difficulté donnée. */
export function sampleChallengeBank(difficulty: ChallengeDifficulty, count: number): BankChallenge[] {
  const pool = BANK_BY_DIFFICULTY[difficulty];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** Liste formatée pour injection dans un prompt IA. */
export function formatChallengeBank(challenges: BankChallenge[]): string {
  return challenges.map((c, i) => `${i + 1}. « ${c.titre} » — ${c.explication}`).join("\n");
}
