export interface PlayerQuarterAgg {
  playerId: string;
  name: string;
  matches: number;
  goals: number;
  assists: number;
  minutes: number;
  attendancePct: number;
  avgCoachRating: number | null;
  motm: number;
  yellowCards: number;
}

export interface QuarterlyReport {
  playerId: string;
  title: string;
  progression: string;
  assiduite: string;
  comportement: string;
  axes: string[];
}

function cleanJson(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (fence) return fence[1];
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text;
}

export function parseQuarterlyReports(content: string): QuarterlyReport[] {
  const raw = JSON.parse(cleanJson(content));
  const arr = Array.isArray(raw) ? raw : raw.reports;
  if (!Array.isArray(arr)) throw new Error("Réponse IA invalide");
  return arr
    .map((r): QuarterlyReport | null => {
      if (!r || typeof r.playerId !== "string") return null;
      return {
        playerId: r.playerId,
        title: typeof r.title === "string" ? r.title.trim().slice(0, 120) : "Bilan du trimestre",
        progression: typeof r.progression === "string" ? r.progression.trim().slice(0, 400) : "",
        assiduite: typeof r.assiduite === "string" ? r.assiduite.trim().slice(0, 300) : "",
        comportement: typeof r.comportement === "string" ? r.comportement.trim().slice(0, 300) : "",
        axes: Array.isArray(r.axes)
          ? (r.axes as unknown[])
              .filter((a): a is string => typeof a === "string")
              .map((a) => a.slice(0, 200))
              .slice(0, 4)
          : [],
      };
    })
    .filter((r): r is QuarterlyReport => r !== null);
}

export interface QuarterlyContext {
  teamName: string;
  quarter: string;
  quarterStart: string;
  quarterEnd: string;
  players: PlayerQuarterAgg[];
}

export async function generateQuarterlyReports(ctx: QuarterlyContext): Promise<QuarterlyReport[]> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY manquante");

  const playersBlock = ctx.players
    .map(
      (p) =>
        `- id: ${p.playerId} | ${p.name} | ${p.matches} matchs, ${p.goals} buts, ${p.assists} passes, ${p.minutes} min, assiduité ${p.attendancePct}%, ` +
        `note coach ${p.avgCoachRating ?? "—"}/10, ${p.motm} fois MVP, ${p.yellowCards} cartons jaunes`
    )
    .join("\n");

  const systemPrompt = `Tu es un entraîneur de football jeunes (diplômé UEFA) qui rédige des bilans trimestriels destinés aux PARENTS.
Tu rédiges des retours bienveillants, concrets et motivants, adaptés à des enfants/adolescents.
Règle d'or : toujours équilibrer un point positif et un axe de progression, ne jamais dévaloriser, rester factuel à partir des seules données fournies (ne pas inventer d'événement, de comportement ou de blessure).

Pour CHAQUE joueur listé, rédige un bilan avec :
- "title" : un titre court et positif (ex. « Une vraie progression en finition »)
- "progression" : 1-2 phrases sur la progression technique/tactique (buts, passes, minutes, notes)
- "assiduite" : 1 phrase sur la présence aux matchs/entraînements et la ponctualité perçue via l'assiduité
- "comportement" : 1 phrase bienveillante sur l'attitude (effort, esprit d'équipe) — tu peux l'encourager génériquement mais reste prudent
- "axes" : 2-3 axes de progression concrets

Réponds UNIQUEMENT en JSON valide : un tableau d'objets avec les clés "playerId", "title", "progression", "assiduite", "comportement", "axes". "playerId" doit être exactement l'id fourni pour chaque joueur.`;

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      temperature: 0.5,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Équipe « ${ctx.teamName} », trimestre ${ctx.quarter} (${ctx.quarterStart} → ${ctx.quarterEnd}).\n\nJoueurs :\n${playersBlock}\n\nRédige les bilans trimestriels.`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Réponse vide de Mistral");
  const reports = parseQuarterlyReports(content);
  if (reports.length === 0) throw new Error("Aucun bilan généré");
  return reports;
}
