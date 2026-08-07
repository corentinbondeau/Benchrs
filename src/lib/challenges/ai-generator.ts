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

function cleanJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const lines = trimmed.split("\n");
    lines.shift();
    if (lines[lines.length - 1]?.includes("```")) lines.pop();
    return lines.join("\n");
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) return trimmed;
  return trimmed.slice(start, end + 1);
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
  return { title, description, difficulty };
}

export async function generateWeeklyChallenge(
  difficulty: ChallengeDifficulty
): Promise<WeeklyChallenge> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY manquante");

  const systemPrompt = `Tu es un entraîneur de football diplômé spécialisé dans la formation des jeunes joueurs.

Tu proposes chaque semaine un « défi de la semaine » amusant et motivant pour une équipe de football jeune (U10-U18). Il doit :
- être lié au football (gestes techniques, jonglages, précision, coordination avec le ballon...) ;
- être réalisable à la maison ou au terrain, seul ou à deux, sans matériel coûteux ;
- pouvoir être validé par une photo ou une courte vidéo ;
- être à la fois ludique et progressif, avec un objectif chiffré clair (ex. nombre de répétitions) quand c'est pertinent.

Niveau de difficulté demandé : ${DIFFICULTY_LABELS[difficulty]}.

Tu réponds UNIQUEMENT par un objet JSON valide (aucun texte avant/après, aucun bloc markdown) avec exactement cette structure :
{
  "title": "Nom court et accrocheur du défi",
  "description": "Consigne détaillée : objectif chiffré, déroulé, critère de validation, conseil si besoin",
  "difficulty": "facile" | "moyen" | "difficile"
}
Le champ "difficulty" doit être exactement : "${difficulty}". Tout est rédigé en français.`;

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      temperature: 0.8,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Génère le défi de la semaine pour une équipe de ${difficulty === "facile" ? "jeunes débutants" : difficulty === "moyen" ? "jeunes confirmés" : "jeunes très à l'aise techniquement"}.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Réponse vide de Mistral");

  return parseChallenge(content);
}
