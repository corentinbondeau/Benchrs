import { TACTICAL_PHASE_NAMES } from "@/lib/training/phases";

export interface SeasonPlanPhase {
  name: string;
  cycle_type: string;
  start_date: string;
  end_date: string;
  focus: string;
  weekly_plan: string[];
}

export interface SeasonPlan {
  title: string;
  overview: string;
  phases: SeasonPlanPhase[];
}

export interface SeasonPlanContext {
  teamName: string;
  season: string;
  seasonStart: string;
  seasonEnd: string;
  prevSummary?: string;
}

function cleanJson(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text);
  if (fence) return fence[1];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text;
}

function isoDate(dateStr: string, fallback: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

export function parseSeasonPlan(content: string): SeasonPlan {
  const raw = JSON.parse(cleanJson(content));
  const phases: SeasonPlanPhase[] = ((raw.phases || []) as Partial<SeasonPlanPhase>[]).map((p, i) => ({
    name: typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 120) : `Cycle ${i + 1}`,
    cycle_type: typeof p.cycle_type === "string" && TACTICAL_PHASE_NAMES.includes(p.cycle_type as never)
      ? p.cycle_type
      : TACTICAL_PHASE_NAMES[0],
    start_date: typeof p.start_date === "string" ? isoDate(p.start_date, "") : "",
    end_date: typeof p.end_date === "string" ? isoDate(p.end_date, "") : "",
    focus: typeof p.focus === "string" ? p.focus.trim().slice(0, 300) : "",
    weekly_plan: Array.isArray(p.weekly_plan)
      ? p.weekly_plan.filter((w): w is string => typeof w === "string").map((w) => w.slice(0, 200)).slice(0, 12)
      : [],
  })).filter((p) => p.start_date && p.end_date);

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : "Plan de saison",
    overview: typeof raw.overview === "string" ? raw.overview.trim().slice(0, 600) : "",
    phases,
  };
}

export async function generateSeasonPlan(ctx: SeasonPlanContext): Promise<SeasonPlan> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY manquante");

  const phaseList = TACTICAL_PHASE_NAMES.join(", ");
  const systemPrompt = `Tu es un entraîneur diplômé (UEFA A) et préparateur physique expert en football jeunes.
Tu conçois un plan de saison périodisé complet pour l'équipe « ${ctx.teamName} » (saison ${ctx.season}, du ${ctx.seasonStart} au ${ctx.seasonEnd}).

Les types de cycle autorisés sont exactement : ${phaseList}.
La saison se découpe en 5 à 7 cycles qui couvrent la période complète, du premier jour au dernier jour, sans trou ni chevauchement.
Pour chaque cycle : nom court, type de cycle (parmi la liste), dates de début et de fin, axe de travail principal (focus), et un déroulé hebdomadaire (weekly_plan) de 4 à 8 lignes décrivant le rythme hebdomadaire (ex. 2-3 séances + match, thèmes par semaine, progression de l'intensité).

Réponds UNIQUEMENT en JSON valide avec cette structure :
{
  "title": "titre court",
  "overview": "résumé du plan en 2-3 phrases",
  "phases": [
    { "name": "...", "cycle_type": "...", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "focus": "...", "weekly_plan": ["...", "..."] }
  ]
}
Ne mentionne pas de compétition, d'adversaire ou d'effectif précis que tu ne connais pas.`;

  const userContent = [
    ctx.prevSummary ? `Contexte de la saison précédente : ${ctx.prevSummary}` : "",
    "Génère le plan de saison périodisé complet.",
  ]
    .filter(Boolean)
    .join("\n\n");

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
        { role: "user", content: userContent },
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
  const plan = parseSeasonPlan(content);
  if (plan.phases.length === 0) throw new Error("Plan invalide (aucun cycle)");
  return plan;
}
