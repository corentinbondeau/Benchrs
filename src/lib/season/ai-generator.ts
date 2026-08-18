export interface SeasonStatsContext {
  teamName: string;
  season: string;
  monthLabel?: string | null;
  results: { opponent: string; scoreFor: number; scoreAgainst: number; date: string }[];
  topScorer?: string | null;
  goalsCount: number;
  attendanceRate?: number | null;
  upcomingCount: number;
  photosCount: number;
  playersCount: number;
  won: number;
  drawn: number;
  lost: number;
}

export interface NewsletterContent {
  title: string;
  intro: string;
  sections: { heading: string; text: string }[];
  note: string;
}

export interface StorybookContent {
  title: string;
  intro: string;
  chapters: { heading: string; text: string }[];
  anecdotes: { title: string; text: string }[];
  conclusion: string;
}

import { callAI, cleanJson } from "@/lib/ai";

function formatResults(ctx: SeasonStatsContext): string {
  const lines = ctx.results.map((r) => {
    const date = new Date(r.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const result = r.scoreFor > r.scoreAgainst ? "Victoire" : r.scoreFor < r.scoreAgainst ? "Défaite" : "Nul";
    return `- ${date} : ${result} ${r.scoreFor}-${r.scoreAgainst} ${r.opponent}`;
  });
  if (lines.length === 0) lines.push("(aucun match terminé)");
  return lines.join("\n");
}

function buildSeasonContextBlock(ctx: SeasonStatsContext): string {
  return [
    `- Équipe : ${ctx.teamName}`,
    `- Saison : ${ctx.season}`,
    ctx.monthLabel ? `- Période concernée : ${ctx.monthLabel}` : "",
    `- Bilan : ${ctx.won}V / ${ctx.drawn}N / ${ctx.lost}D (${ctx.goalsCount} buts marqués)`,
    ctx.topScorer ? `- Meilleur buteur : ${ctx.topScorer}` : "",
    ctx.attendanceRate !== null && ctx.attendanceRate !== undefined ? `- Taux de présence moyen : ${Math.round(ctx.attendanceRate)}%` : "",
    `- Matchs à venir : ${ctx.upcomingCount}`,
    ctx.photosCount > 0 ? `- Photos partagées dans la galerie : ${ctx.photosCount}` : "",
    `- Joueurs actifs : ${ctx.playersCount}`,
    "",
    "Résultats détaillés :",
    formatResults(ctx),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildNewsletterPrompt(ctx: SeasonStatsContext): string {
  return `Tu es le rédacteur d'une newsletter pour un club de football amateur. Tu écris en français, avec un ton chaleureux et convivial destiné aux familles et aux joueurs.

Tu génères UNIQUEMENT du JSON valide, sans commentaire, au format :
{
  "title": "Titre court et accrocheur (max 60 caractères)",
  "intro": "Introduction de 2 à 4 phrases qui salue les familles et résume la période",
  "sections": [
    { "heading": "Titre de section court", "text": "3 à 5 phrases de contenu" }
  ],
  "note": "Phrase finale (remerciement ou prochain rendez-vous)"
}

Le JSON doit contenir entre 2 et 4 sections. Les sections possibles, à adapter au contexte : les résultats du mois, le/la meilleur(e) buteur/buteuse, la vie du groupe (assiduité, photos), les prochains rendez-vous.

CONTEXTE RÉEL DE L'ÉQUIPE :
${buildSeasonContextBlock(ctx)}

🛑 RÈGLES :
1. N'invente AUCUNE donnée : utilise uniquement les informations du contexte ci-dessus.
2. Ne donne pas de noms de joueurs autres que le meilleur buteur indiqué.
3. Sois positif et rassembleur, jamais critique envers des joueurs.
4. Si aucune donnée de match n'est disponible, parle de la vie du groupe et des prochains rendez-vous.
5. Réponds uniquement avec le JSON, sans texte avant ni après.`;
}

export function buildStorybookPrompt(ctx: SeasonStatsContext): string {
  return `Tu es le rédacteur du livre de saison d'un club de football amateur (une sorte de livret souvenir distribué aux familles). Tu écris en français, avec un ton chaleureux, rétrospectif et émouvant.

Tu génères UNIQUEMENT du JSON valide, sans commentaire, au format :
{
  "title": "Titre du livret (max 60 caractères)",
  "intro": "Introduction générale de la saison (3 à 5 phrases)",
  "chapters": [
    { "heading": "Titre de chapitre", "text": "4 à 6 phrases racontant un pan de la saison" }
  ],
  "anecdotes": [
    { "title": "Titre de l'anecdote", "text": "2 à 3 phrases" }
  ],
  "conclusion": "Message de fin de saison (2 à 3 phrases)"
}

Le JSON doit contenir entre 3 et 5 chapitres et entre 2 et 4 anecdotes.

CONTEXTE RÉEL DE L'ÉQUIPE :
${buildSeasonContextBlock(ctx)}

🛑 RÈGLES :
1. N'invente AUCUNE donnée chiffrée ou résultat : utilise uniquement le contexte ci-dessus.
2. Les anecdotes doivent rester génériques et positives (matchs mémorables, progression du groupe, vie du club) — ne jamais nommer un joueur dans une anecdote.
3. Sois chaleureux et rassembleur.
4. Réponds uniquement avec le JSON, sans texte avant ni après.`;
}

export function buildGreetingPrompt(ctx: SeasonStatsContext, playerName: string): string {
  return `Tu es un entraîneur chaleureux qui souhaite de bonnes vacances à un de ses joueurs à la fin de la saison. Tu écris en français, en tutoyant le joueur.

Rédige un message de vœux personnel de 3 à 5 phrases, sans objet ni titre, commençant directement par le message.

CONTEXTE :
- Équipe : ${ctx.teamName}
- Saison : ${ctx.season}
- Joueur : ${playerName}
${ctx.results.length > 0 ? `- Derniers résultats : ${formatResults(ctx)}` : ""}

🛑 RÈGLES :
1. Personnalise légèrement avec le prénom du joueur et le nom de l'équipe.
2. Reste positif, encourageant et chaleureux ; ne critique jamais.
3. N'invente AUCUNE statistique individuelle (buts, passes) — parle de la saison, du plaisir partagé et des vacances.
4. Termine par une phrase d'encouragement pour la saison prochaine.`;
}

export async function generateNewsletter(ctx: SeasonStatsContext): Promise<NewsletterContent> {
  const raw = cleanJson(await callAI(buildNewsletterPrompt(ctx), "Génère le contenu maintenant, en respectant strictement le format JSON demandé.", { temperature: 0.8, maxTokens: 2048, responseFormat: "json" }));
  const parsed = JSON.parse(raw) as Partial<NewsletterContent>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .map((s) => ({
          heading: str(s?.heading).slice(0, 100),
          text: str(s?.text).slice(0, 2000),
        }))
        .filter((s) => s.heading && s.text)
        .slice(0, 4)
    : [];
  const title = str(parsed.title).slice(0, 80);
  if (!title || sections.length === 0) throw new Error("Newsletter IA invalide");
  return {
    title,
    intro: str(parsed.intro),
    sections,
    note: str(parsed.note),
  };
}

export async function generateStorybook(ctx: SeasonStatsContext): Promise<StorybookContent> {
  const raw = cleanJson(await callAI(buildStorybookPrompt(ctx), "Génère le contenu maintenant, en respectant strictement le format JSON demandé.", { temperature: 0.8, maxTokens: 2048, responseFormat: "json" }));
  const parsed = JSON.parse(raw) as Partial<StorybookContent>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const chapters = Array.isArray(parsed.chapters)
    ? parsed.chapters
        .map((c) => ({ heading: str(c?.heading).slice(0, 100), text: str(c?.text).slice(0, 3000) }))
        .filter((c) => c.heading && c.text)
        .slice(0, 5)
    : [];
  const anecdotes = Array.isArray(parsed.anecdotes)
    ? parsed.anecdotes
        .map((a) => ({ title: str(a?.title).slice(0, 100), text: str(a?.text).slice(0, 2000) }))
        .filter((a) => a.title && a.text)
        .slice(0, 4)
    : [];
  const title = str(parsed.title).slice(0, 80);
  if (!title || chapters.length === 0) throw new Error("Livret IA invalide");
  return {
    title,
    intro: str(parsed.intro),
    chapters,
    anecdotes,
    conclusion: str(parsed.conclusion),
  };
}

export async function generateGreeting(ctx: SeasonStatsContext, playerName: string): Promise<string> {
  const content = await callAI(buildGreetingPrompt(ctx, playerName), "Rédige le message de vœux maintenant.", { temperature: 0.8, maxTokens: 2048, responseFormat: "text" });
  return content.slice(0, 1200);
}
