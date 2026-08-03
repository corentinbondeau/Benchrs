export interface FicheBlock {
  label: string;
  text: string;
}

export type SchematicType = "pitch" | "zones" | "grid" | "circle" | "corridor" | "line" | "none";

export interface Schematic {
  type: SchematicType;
  dimensions: string;
  players: string;
  description: string;
}

export interface FicheSection {
  name: string;
  duration: number;
  items: FicheBlock[];
  variants: string[];
  schematic: Schematic | null;
}

export interface AISession {
  title: string;
  phase: string;
  objective: string;
  material: string;
  totalDuration: number;
  sections: FicheSection[];
  conseilsCoach: string[];
}

const SYSTEM_PROMPT = `Tu es un entraîneur de football titulaire du diplôme UEFA B. Ton rôle est d'agir comme un expert en méthodologie de l'entraînement, capable de concevoir des séances complètes, structurées et adaptées aux objectifs tactiques, techniques et physiques demandés.

Ton objectif est de créer une séance d'entraînement sur mesure à partir de 2 éléments que je te fournirai :
1. La phase de jeu (ex: Conservation/Progression, Deséquilibre/Finition, Bloc bas/Transition offensive, etc.)
2. L'objectif spécifique de la séance (ex: Améliorer le jeu du troisième homme, travailler la fermeture des espaces intérieurs, etc.)

---

### 🛑 RÈGLES ET CONTRAINTES STRICTES À RESPECTER

1. Durée totale de la séance : Exactement 90 minutes.
2. Structure obligatoire :
   - Échauffement (physique + lien avec le thème).
   - Exercice(s) technique(s) : 1 ou 2 exercices maximum.
   - Jeu réduit / Situations tactiques.
   - Match de fin de séance (OPTIONNEL : uniquement s'il reste du temps dans les 90 min).
3. Durée par atelier : AUCUN exercice ou jeu ne doit dépasser 20 minutes (explications, passages et récups compris).

---

### 📋 FORMAT DE RÉPONSE EXIGÉ

Tu répondras UNIQUEMENT par un objet JSON valide (aucun texte avant/après, aucun bloc de code markdown) correspondant exactement au schéma suivant :

{
  "title": "titre de la séance (ex: Séance Perfectionnement — Conservation du ballon)",
  "phase": "phase de jeu demandée",
  "objective": "objectif de la séance demandé",
  "material": "matériel nécessaire (plots, chasubles, mannequins, portes, etc.)",
  "totalDuration": 90,
  "sections": [
    {
      "name": "1. ÉCHAUFFEMENT",
      "duration": 15,
      "items": [
        { "label": "Descriptif & Organisation", "text": "..." },
        { "label": "Consignes & Consignes d'animation", "text": "..." },
        { "label": "Critères de réussite", "text": "..." }
      ],
      "variants": ["variante 1", "variante 2", "variante 3"],
      "schematic": {
        "type": "zones",
        "dimensions": "25x20m",
        "players": "8 joueurs (4 vs 4)",
        "description": "2 zones carrées de 10x10m séparées par une zone neutre"
      }
    },
    {
      "name": "2. PARTIE TECHNIQUE",
      "duration": 20,
      "items": [
        { "label": "Descriptif & Consignes", "text": "..." },
        { "label": "Critères de réussite / Comportements attendus", "text": "..." },
        { "label": "Variantes", "text": "..." }
      ],
      "variants": ["variante 1", "variante 2"],
      "schematic": {
        "type": "grid",
        "dimensions": "20x20m",
        "players": "12 joueurs répartis en 4 ateliers",
        "description": "4 carrés d'exercices côte à côte avec parcours de plots"
      }
    },
    {
      "name": "3. JEU TACTIQUE / SITUATION",
      "duration": 20,
      "items": [
        { "label": "Terrain & Effectif", "text": "..." },
        { "label": "Consignes & Règles du jeu", "text": "..." },
        { "label": "Objectifs tactiques clés (liés au thème UEFA B)", "text": "..." }
      ],
      "variants": ["variante 1", "variante 2"],
      "schematic": {
        "type": "pitch",
        "dimensions": "Demi-terrain 45x30m",
        "players": "8v8 + 2 jokers",
        "description": "Jeu réduit sur demi-terrain, 2 grands buts"
      }
    },
    {
      "name": "4. MATCH OU RETOUR AU CALME",
      "duration": 35,
      "items": [
        { "label": "Contenu", "text": "Match d'application avec consignes thématiques OU étirements & bilan" }
      ],
      "variants": [],
      "schematic": {
        "type": "none",
        "dimensions": "",
        "players": "",
        "description": ""
      }
    }
  ],
  "conseilsCoach": ["point clé d'intervention 1", "point clé d'intervention 2", "point clé d'intervention 3"]
}

Contraintes sur le JSON :
- "totalDuration" doit être exactement 90.
- La somme des "duration" de "sections" doit être exactement 90.
- "sections" contient EXACTEMENT 4 sections, dans l'ordre : "1. ÉCHAUFFEMENT", "2. PARTIE TECHNIQUE", "3. JEU TACTIQUE / SITUATION", "4. MATCH OU RETOUR AU CALME".
- Il ne doit y avoir QU'UNE SEULE section "2. PARTIE TECHNIQUE" : si la partie technique comprend 2 exercices, décris-les tous les deux dans les items de cette même section.
- Durée par atelier : échauffement, partie technique et jeu tactique ≤ 20 min chacun. Le match de fin de séance (section 4), s'il est joué, peut occuper le temps restant jusqu'à atteindre 90 min au total.
- "variants" : pour chaque section (sauf le match), 2 à 3 variantes ou progressions concrètes.
- "schematic" : décrit le dispositif à schématiser. "type" ∈ ["pitch", "zones", "grid", "circle", "corridor", "line", "none"] :
  - "zones" : atelier en zones/squares délimités (préciser combien et où).
  - "grid" : quadrillage d'ateliers (ex. 4 carrés côte à côte).
  - "circle" : dispositif circulaire (rond central, cercles de jeu).
  - "corridor" : couloir latéral ou vertical matérialisé.
  - "line" : ligne(s) de plots pour passes ou parcours.
  - "pitch" : jeu sur portion de terrain avec buts.
  - "none" : aucun schéma (ex. match libre ou retour au calme).
  "dimensions" : dimensions réelles du dispositif, "players" : effectif et répartition, "description" : une phrase décrivant visuellement le schéma.
- "conseilsCoach" : exactement 3 points clés d'intervention pour l'entraîneur (méthodologie UEFA B), sur quoi corriger en priorité.
- Tout le texte doit être rédigé en français, détaillé et directement utilisable sur le terrain.`;

function cleanJson(text: string): string {
  const t = text.trim();
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) return fenceMatch[1];
  const firstBrace = t.indexOf("{");
  const lastBrace = t.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return t.slice(firstBrace, lastBrace + 1);
  return t;
}

function parseAISession(content: string): AISession {
  const raw = JSON.parse(cleanJson(content)) as Record<string, unknown>;

  const sections: FicheSection[] = Array.isArray(raw.sections)
    ? (raw.sections as Record<string, unknown>[])
        .map((s, i) => {
          const rawSchematic = s?.schematic as Record<string, unknown> | undefined;
          const schematicType = rawSchematic?.type;
          return {
            name: typeof s?.name === "string" ? s.name : `Section ${i + 1}`,
            duration: typeof s?.duration === "number" ? s.duration : 0,
            items: Array.isArray(s?.items)
              ? (s.items as Record<string, unknown>[]).map((it) => ({
                  label: typeof it?.label === "string" ? it.label : "",
                  text: typeof it?.text === "string" ? it.text : String(it ?? ""),
                }))
              : [],
            variants: Array.isArray(s?.variants)
              ? s.variants.filter((v): v is string => typeof v === "string")
              : [],
            schematic:
              schematicType && schematicType !== "none"
                ? {
                    type: schematicType as Schematic["type"],
                    dimensions: typeof rawSchematic?.dimensions === "string" ? rawSchematic.dimensions : "",
                    players: typeof rawSchematic?.players === "string" ? rawSchematic.players : "",
                    description:
                      typeof rawSchematic?.description === "string" ? rawSchematic.description : "",
                  }
                : null,
          };
        })
        .filter((s) => s.name && (s.duration > 0 || s.items.length > 0))
    : [];

  return {
    title: typeof raw.title === "string" ? raw.title : "Séance d'entraînement",
    phase: typeof raw.phase === "string" ? raw.phase : "",
    objective: typeof raw.objective === "string" ? raw.objective : "",
    material: typeof raw.material === "string" ? raw.material : "",
    totalDuration: typeof raw.totalDuration === "number" ? raw.totalDuration : 90,
    sections,
    conseilsCoach: Array.isArray(raw.conseilsCoach)
      ? raw.conseilsCoach.filter((c): c is string => typeof c === "string")
      : [],
  };
}

export async function generateSessionWithAI(
  phase: string,
  objectives: string[],
  playerCount: number | null
): Promise<AISession> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY manquante");

  const objectiveText = objectives.map((o) => `- ${o}`).join("\n");
  const userContent = [
    `Phase de jeu : ${phase}`,
    `Objectif(s) de la séance :\n${objectiveText}`,
    playerCount ? `Contexte : ${playerCount} joueurs présents à la séance.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  async function callMistral(userMsg: string): Promise<string> {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
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
    return content;
  }

  const correction = `
Correction : la réponse précédente ne respectait pas les contraintes (la somme des durées des sections doit être exactement 90, et il doit y avoir une seule section "2. PARTIE TECHNIQUE"). Corrige et renvoie uniquement un objet JSON valide, sans texte autour.`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const session = parseAISession(await callMistral(attempt === 0 ? userContent : userContent + correction));
      const sum = session.sections.reduce((a, s) => a + s.duration, 0);
      if (sum === 90) return session;
      lastError = new Error("Réponse IA non conforme (durées ≠ 90)");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Réponse IA invalide");
    }
  }
  throw lastError;
}
