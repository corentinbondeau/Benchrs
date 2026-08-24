import { callAI } from "@/lib/ai";

export type AnnouncementType = "convocation" | "info";
export type AnnouncementAudience = "joueurs" | "parents";
export type AnnouncementTone = "motivant" | "sobre" | "chaleureux";

export const ANNOUNCEMENT_TYPES = ["convocation", "info"] as const;
export const ANNOUNCEMENT_AUDIENCES = ["joueurs", "parents"] as const;
export const ANNOUNCEMENT_TONES = ["motivant", "sobre", "chaleureux"] as const;

export interface AnnouncementEventContext {
  eventId: string;
  eventType: string;
  title: string;
  eventDate: string;
  meetingTime?: string | null;
  location?: string | null;
  opponent?: string | null;
  description?: string | null;
  teamName: string;
  playersCount: number;
}

export interface AnnouncementContext {
  type: AnnouncementType;
  audience: AnnouncementAudience;
  tone: AnnouncementTone;
  event: AnnouncementEventContext | null;
  topic: string;
  points: string[];
}

const TONE_GUIDE: Record<AnnouncementTone, string> = {
  motivant: "Ton motivant et engageant : on donne envie de venir, sans jargon. Courtes phrases percutantes.",
  sobre: "Ton sobre et professionnel : informatif, concis, direct, sans fioritures.",
  chaleureux: "Ton chaleureux et convivial : bienveillant, tourné vers la cohésion du groupe et le plaisir de se retrouver.",
};

const AUDIENCE_GUIDE: Record<AnnouncementAudience, string> = {
  joueurs:
    "Le message s'adresse directement aux joueurs : tutoiement, langage adapté, précisions pratiques qui les concernent.",
  parents:
    "Le message s'adresse aux parents : vouvoiement, ton rassurant, on précise l'organisation et ce qu'on attend d'eux (transport, équipement, réponse).",
};

const POINTS_LABELS: Record<string, string> = {
  horaire: "Préciser clairement l'heure de rendez-vous et l'heure du début.",
  equipement: "Rappeler la tenue et l'équipement à apporter (chaussures, protège-tibias, bouteille d'eau, chasuble éventuelle).",
  reponse: "Demander une réponse obligatoire dans un délai donné pour valider la présence.",
  covoiturage: "Évoquer la possibilité de covoiturage ou le regroupement.",
  lieu: "Donner le lieu précis de rendez-vous et comment s'y rendre.",
};

function formatDateFr(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildEventBlock(e: AnnouncementEventContext): string {
  const lines = [
    `- Événement : ${e.title}`,
    `- Type : ${e.eventType === "match" ? "match" : "entraînement"}`,
    e.opponent ? `- Adversaire : ${e.opponent}` : "",
    `- Date : ${formatDateFr(e.eventDate)}`,
    e.meetingTime ? `- Heure de rendez-vous : ${e.meetingTime.slice(0, 5)}` : "",
    `- Début : ${new Date(e.eventDate).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`,
    e.location ? `- Lieu : ${e.location}` : "",
    e.description ? `- Informations complémentaires : ${e.description}` : "",
    `- Équipe : ${e.teamName} (${e.playersCount} joueurs actifs)`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildAnnouncementPrompt(ctx: AnnouncementContext): string {
  const header = `Tu es le responsable de communication d'un club de football amateur. Tu rédiges une annonce en français, prête à être envoyée dans un groupe de discussion (WhatsApp, SMS, mail).

---

📣 TYPE D'ANNONCE : ${ctx.type === "convocation" ? "CONVOCATION pour un événement" : "INFORMATION aux membres de l'équipe"}

🎯 DESTINATAIRES : ${ctx.audience}
${AUDIENCE_GUIDE[ctx.audience]}

✍️ TON : ${ctx.tone}
${TONE_GUIDE[ctx.tone]}

${ctx.type === "convocation" && ctx.event ? `📅 CONTEXTE DE L'ÉVÉNEMENT :
${buildEventBlock(ctx.event)}` : `📝 SUJET DE L'INFORMATION :
${ctx.topic || "Sujet non précisé"}`}

✅ POINTS À INCLURE (si cohérents avec l'annonce) :
${ctx.points.length > 0 ? ctx.points.map((p) => `- ${POINTS_LABELS[p] ?? p}`).join("\n") : "- (aucun point spécifique demandé, utilise le bon sens)"}

---

🛑 RÈGLES :
1. Rédige UNIQUEMENT le corps de l'annonce (3 à 10 phrases), sans objet ni titre ni salutation d'introduction. Commence directement par la phrase d'ouverture.
2. Rends les informations pratiques précises (date, heure, lieu, adversaire si match).
3. Termine par une phrase d'action claire (ex. « Merci de confirmer votre présence avant jeudi. »).
4. Ne donne AUCUNE information qui n'est pas fournie ci-dessus : ne pas inventer d'heure, de lieu, de rendez-vous ou d'instruction.
5. ${ctx.audience === "joueurs" ? "Utilise le tutoiement." : "Utilise le vouvoiement."}`;

  return header;
}

export async function generateAnnouncement(ctx: AnnouncementContext): Promise<string> {
  const content = await callAI(buildAnnouncementPrompt(ctx), "Rédige l'annonce maintenant.", { temperature: 0.8, maxTokens: 1024, responseFormat: "text" });
  return content.trim();
}
