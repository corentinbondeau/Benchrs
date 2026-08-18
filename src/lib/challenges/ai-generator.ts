import { callAI, cleanJson } from "@/lib/ai";

export const CHALLENGE_DIFFICULTIES = ["facile", "moyen", "difficile"] as const;

export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number];

export interface WeeklyChallenge {
  title: string;
  description: string;
  difficulty: ChallengeDifficulty;
}

const DIFFICULTY_LABELS: Record<ChallengeDifficulty, string> = {
  facile: "accessible à tous les joueurs, sans prérequis technique particulier",
  moyen: "demande un minimum de technique et d'entraînement, réalisable en quelques jours",
  difficile: "exige une vraie maîtrise technique ; réservé aux joueurs les plus adroits",
};

const MAX_TITLE_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 280;

function truncateToSentence(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  let end = -1;
  for (let i = cut.length - 1; i >= 0; i--) {
    if (cut[i] === "." || cut[i] === "!" || cut[i] === "?" || cut[i] === "\n") {
      end = i + 1;
      break;
    }
  }
  const cutAt = end >= max * 0.5 ? end : max;
  return cut.slice(0, cutAt).replace(/[.,;:\s]+$/, "");
}

function parseChallenge(content: string): WeeklyChallenge {
  const data = JSON.parse(cleanJson(content)) as Record<string, unknown>;
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const difficulty =
    typeof data.difficulty === "string" &&
    (CHALLENGE_DIFFICULTIES as readonly string[]).includes(data.difficulty)
      ? (data.difficulty as ChallengeDifficulty)
      : "moyen";
  if (!title || !description) throw new Error("Réponse IA incomplète");
  return {
    title: title.slice(0, MAX_TITLE_LENGTH),
    description: truncateToSentence(description, MAX_DESCRIPTION_LENGTH),
    difficulty,
  };
}

export async function generateWeeklyChallenge(
  difficulty: ChallengeDifficulty
): Promise<WeeklyChallenge> {
  const systemPrompt = `Tu es un entraîneur de football diplômé spécialisé dans la formation des jeunes joueurs.

Tu proposes chaque semaine un « défi de la semaine » amusant et motivant pour une équipe de football jeune (U10-U18). Il doit :
- être lié au football (gestes techniques, jonglages, précision, coordination avec le ballon...) ;
- être réalisable à la maison ou au terrain, seul ou à deux, sans matériel coûteux ;
- pouvoir être validé par une photo ou une courte vidéo ;
- être à la fois ludique et progressif, avec un objectif chiffré clair (ex. nombre de répétitions) quand c'est pertinent.

IMPORTANT — le défi doit être COURT et rapide à lire, car les jeunes joueurs le consultent sur mobile :
- "title" : maximum 5 mots, accrocheur (ex. « Le jongleur fou », « Tire de précision »).
- "description" : maximum 3 phrases courtes et directes (environ 250 caractères). Objectif chiffré + critère de validation en quelques mots. Interdiction de phrases longues, de paragraphes, de listes ou de jargon.

Niveau de difficulté demandé : ${DIFFICULTY_LABELS[difficulty]}.

Tu réponds UNIQUEMENT par un objet JSON valide (aucun texte avant/après, aucun bloc markdown) avec exactement cette structure :
{
  "title": "Nom court et accrocheur du défi",
  "description": "Consigne détaillée : objectif chiffré, déroulé, critère de validation, conseil si besoin",
  "difficulty": "facile" | "moyen" | "difficile"
}
Le champ "difficulty" doit être exactement : "${difficulty}". Tout est rédigé en français.`;

  const content = await callAI(
    systemPrompt,
    `Génère le défi de la semaine pour une équipe de ${difficulty === "facile" ? "jeunes débutants" : difficulty === "moyen" ? "jeunes confirmés" : "jeunes très à l'aise techniquement"}.`,
    { temperature: 0.8, maxTokens: 1024, responseFormat: "json" }
  );

  return parseChallenge(content);
}
