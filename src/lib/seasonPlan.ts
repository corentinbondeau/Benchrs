import { TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import { callAI, cleanJson } from "@/lib/ai";

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

/** Formatte une Date locale en YYYY-MM-DD (toISOString recule d'un jour hors UTC). */
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoDate(dateStr: string, fallback: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? fallback : localIsoDate(d);
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

  // Recolle les micro-trous (≤ 7 jours) entre cycles consécutifs : ce sont des
  // transitions parasites du modèle, pas des pauses voulues. Les trous plus
  // longs (vacances, etc.) sont conservés — le retry les signale, le plan
  // reste utilisable en dégradé.
  const byDate = [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date));
  for (let i = 0; i < byDate.length - 1; i++) {
    const end = new Date(byDate[i].end_date + "T00:00:00");
    const nextStart = new Date(byDate[i + 1].start_date + "T00:00:00");
    if (isNaN(end.getTime()) || isNaN(nextStart.getTime())) continue;
    const gapDays = Math.round((nextStart.getTime() - end.getTime()) / 86400000) - 1;
    if (gapDays >= 1 && gapDays <= 7) {
      const snapped = new Date(nextStart);
      snapped.setDate(snapped.getDate() - 1);
      byDate[i].end_date = localIsoDate(snapped);
    }
  }

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 120) : "Plan de saison",
    overview: typeof raw.overview === "string" ? raw.overview.trim().slice(0, 600) : "",
    phases,
  };
}

/** Liste les trous/chevauchements entre cycles consécutifs (triés par date de début). */
function findDateGaps(phases: SeasonPlanPhase[]): string[] {
  const sorted = [...phases].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const issues: string[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const end = new Date(sorted[i].end_date + "T00:00:00");
    const nextStart = new Date(sorted[i + 1].start_date + "T00:00:00");
    if (isNaN(end.getTime()) || isNaN(nextStart.getTime())) continue;
    const expectedNext = new Date(end);
    expectedNext.setDate(expectedNext.getDate() + 1);
    if (nextStart.getTime() === expectedNext.getTime()) continue; // contigu = OK
    if (nextStart.getTime() <= end.getTime()) {
      issues.push(`chevauchement « ${sorted[i].name} » (fin ${sorted[i].end_date}) / « ${sorted[i + 1].name} » (début ${sorted[i + 1].start_date})`);
    } else {
      issues.push(`trou entre « ${sorted[i].name} » (fin ${sorted[i].end_date}) et « ${sorted[i + 1].name} » (début ${sorted[i + 1].start_date})`);
    }
  }
  return issues;
}

export async function generateSeasonPlan(ctx: SeasonPlanContext): Promise<SeasonPlan> {
  const phaseList = TACTICAL_PHASE_NAMES.join(", ");
  const systemPrompt = `Tu es un entraîneur diplômé (UEFA A) et préparateur physique expert en football jeunes.
Tu conçois un plan de saison périodisé complet pour l'équipe « ${ctx.teamName} » (saison ${ctx.season}, du ${ctx.seasonStart} au ${ctx.seasonEnd}).

Règles STRICTES :
- Tout le texte (title, overview, name, focus, weekly_plan) doit être en FRANÇAIS.
- Les types de cycle (cycle_type) doivent être EXACTEMENT l'une de ces chaînes, sans traduction ni variante : ${phaseList}.
- La saison se découpe en EXACTEMENT 5, 6 ou 7 cycles (jamais plus, jamais moins) qui couvrent la période complète, du premier jour au dernier jour, sans trou ni chevauchement. Les vacances scolaires (Noël, février, etc.) font partie des cycles concernés : aucun jour de trou n'est autorisé entre la fin d'un cycle et le début du suivant.
- Pour chaque cycle : nom court en français, type de cycle (parmi la liste), dates de début et de fin (YYYY-MM-DD), axe de travail principal (focus), et un déroulé hebdomadaire (weekly_plan) de 4 à 8 lignes décrivant le rythme hebdomadaire (ex. 2-3 séances + match, thèmes par semaine, progression de l'intensité).

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

  const correction = `\nCorrection : la réponse précédente ne respectait pas les règles. Vérifie : (1) cycle_type doit être EXACTEMENT l'une des chaînes autorisées (${phaseList}), sans traduction ; (2) il doit y avoir EXACTEMENT 5, 6 ou 7 cycles ; (3) tout le texte doit être en français ; (4) weekly_plan doit avoir 4 à 8 lignes par cycle. Renvoie uniquement un objet JSON valide complet, sans texte autour. Commence par { et termine par }.`;

  let lastError: Error | null = null;
  let gapHint = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await callAI(
        systemPrompt,
        attempt === 0 ? userContent : userContent + correction + gapHint,
        { temperature: 0.5, maxTokens: 8192, responseFormat: "json" }
      );
      const plan = parseSeasonPlan(content);
      if (plan.phases.length === 0) throw new Error("Plan invalide (aucun cycle)");
      // 5-7 cycles = contrainte stricte du prompt ; en dessous/au-dessus on réessaie
      if (plan.phases.length < 5 || plan.phases.length > 7) {
        throw new Error(`Plan invalide (${plan.phases.length} cycles, attendu 5-7)`);
      }
      // weekly_plan trop pauvre = réponse tronquée ou non conforme
      const thinWeeklies = plan.phases.filter((p) => p.weekly_plan.length < 3).length;
      if (thinWeeklies > plan.phases.length / 2) {
        throw new Error(`Plan invalide (${thinWeeklies} cycles avec weekly_plan < 3 lignes)`);
      }
      // Dates discontinues : trous ou chevauchements entre cycles consécutifs
      const gaps = findDateGaps(plan.phases);
      if (gaps.length > 0) {
        gapHint = `\nAussi : les dates sont discontinues — ${gaps.join("; ")}. Le cycle suivant doit commencer LE JOUR QUI SUIT la fin du cycle précédent (pas de trou, pas de chevauchement).`;
        if (attempt === 0) {
          throw new Error(`Plan invalide (${gaps.length} trous/chevauchement(s) dans les dates)`);
        }
        // 2e tentative : on retourne le plan malgré les trous (dégradé, mieux qu'un échec total)
      }
      return plan;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Réponse IA invalide");
    }
  }
  throw lastError!;
}
