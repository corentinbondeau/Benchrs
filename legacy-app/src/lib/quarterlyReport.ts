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
  source?: "ai" | "manual";
}

import { callAI, cleanJson } from "@/lib/ai";

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

  const userMessage = `Équipe « ${ctx.teamName} », trimestre ${ctx.quarter} (${ctx.quarterStart} → ${ctx.quarterEnd}).\n\nJoueurs :\n${playersBlock}\n\nRédige les bilans trimestriels.`;
  const correction = `\nCorrection : la réponse précédente n'était pas un JSON valide ou était tronquée. Renvoie uniquement un JSON valide complet, sans texte autour.`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await callAI(
        systemPrompt,
        attempt === 0 ? userMessage : userMessage + correction,
        { temperature: 0.5, maxTokens: 8192, responseFormat: "json" }
      );
      const reports = parseQuarterlyReports(content);
      if (reports.length === 0) throw new Error("Aucun bilan généré");
      return reports;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Réponse IA invalide");
    }
  }
  throw lastError!;
}
