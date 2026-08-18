import { callAI, cleanJson } from "@/lib/ai";

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
  animation?: string;
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

export const FOOTBALL_SYSTEMS = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "5-3-2"] as const;
export type FootballSystem = (typeof FOOTBALL_SYSTEMS)[number];

export const EXPERTISE_LEVELS = ["BMF", "BE", "UEFA B", "UEFA A"] as const;
export type ExpertiseLevel = (typeof EXPERTISE_LEVELS)[number];

const EXPERTISE_PERSONAS: Record<ExpertiseLevel, string> = {
  BMF: `Tu es un entraîneur de football diplômé BMF (Brevet Moniteur de Football) et préparateur physique. Tu animes des équipes de jeunes (écoles de football et débutants) : tes séances sont SIMPLES, ludiques, avec des consignes courtes et compréhensibles par les enfants. Tu privilégies les jeux, le maximum de touches de balle et le plaisir.`,
  BE: `Tu es un entraîneur de football diplômé BE (Brevet d'Entraîneur de Football) et préparateur physique. Tu encadres des équipes amateurs et jeunes compétiteurs : séances structurées, pédagogie progressive, consignes claires et applicables immédiatement sur le terrain.`,
  "UEFA B": `Tu es un entraîneur de football de haut niveau, diplômé UEFA B et préparateur physique diplômé.`,
  "UEFA A": `Tu es un entraîneur de football de très haut niveau, diplômé UEFA A, habitué au football professionnel et au très haut niveau amateur. Tu conçois des séances exigeantes avec un haut niveau de détail méthodologique, des principes tactiques avancés et une exigence technique élevée.`,
};

const EXPERTISE_AREAS: Record<ExpertiseLevel, string> = {
  BMF: `1. PRÉPARATION PHYSIQUE & ATHLÉTISATION — jeux de motricité, coordination, endurance ludique, prévention des blessures. L'accent est mis sur le plaisir et la découverte.
2. ANIMATION OFFENSIVE — jeu vers l'avant, dribble, marquer des buts. Consignes simples : "toujours jouer vers l'avant", "on marque dès qu'on peut".
3. ANIMATION DÉFENSIVE — récupérer la balle en s'amusant, jouer en équipe, courir vers son but pour le défendre. Consignes simples et imagées.
4. SYSTÈMES DE JEU — notions de base (garder son poste, s'écarter, avancer) sans surcharger les enfants d'informations tactiques.

Ton objectif : concevoir une séance complète de 90 minutes, claire et directement animable, qui suit TRÈS PRÉCISÉMENT la phase de jeu et les objectifs fournis. Chaque atelier doit découler du thème : interdit de proposer un exercice générique hors sujet. Tout le contenu doit être rédigé en français, détaillé et exploitable sans autre support. Les consignes doivent être simples, courtes et positives, adaptées à un public de jeunes joueurs.`,
  BE: `1. PRÉPARATION PHYSIQUE & ATHLÉTISATION — développement des qualités aérobies, renforcement, mobilité, prévention des blessures, avec une charge progressive et adaptée au niveau des joueurs.
2. ANIMATION OFFENSIVE — construction du jeu, création de déséquilibre, jeu entre les lignes, jeu à 2-3, finition. Tu maîtrises les principes offensifs et les zones de déclenchement.
3. ANIMATION DÉFENSIVE — organisation du bloc, protection de l'axe, pressing, transitions. Tu maîtrises les alignements, glissements et la densité dans le couloir de jeu.
4. SYSTÈMES DE JEU — 4-2-3-1, 4-3-3, 3-5-2, 4-4-2, 5-3-2, etc. Tu connais les rôles et les équilibres de chaque système.

Ton objectif : concevoir une séance complète de 90 minutes, claire et directement animable sur le terrain, qui suit TRÈS PRÉCISÉMENT la phase de jeu et les objectifs fournis. Chaque atelier doit découler du thème : interdit de proposer un exercice générique hors sujet. Tout le contenu doit être rédigé en français, détaillé et exploitable sans autre support.`,
  "UEFA B": `1. PRÉPARATION PHYSIQUE & ATHLÉTISATION — reprise en forme après une longue période sans sport, développement des qualités aérobies et anaérobies, renforcement musculaire, mobilité, prévention des blessures. Tu doses toujours volume et intensité par paliers progressifs, jamais de charge de compétition sur une reprise.
2. ANIMATION OFFENSIVE — construction et progression du jeu, création de déséquilibre, jeu dans les intervalles et entre les lignes, jeu à 2-3, finition. Tu maîtrises les principes offensifs, les zones de déclenchement et la notion de surnombre.
3. ANIMATION DÉFENSIVE — organisation du bloc, protection de l'axe, pressing et contre-pressing, récupération, transition défensive. Tu maîtrises les alignements, glissements, prises en charge et la densité dans le couloir de jeu.
4. SYSTÈMES DE JEU — 4-2-3-1, 4-3-3, 3-5-2, 4-4-2, 5-3-2, etc. Tu connais parfaitement les rôles, les couloirs de passes et les équilibres propres à chaque système, et tu adaptes chaque situation de jeu au système de jeu de l'équipe.

Ton objectif : concevoir une séance complète de 90 minutes, claire et directement animable sur le terrain, qui suit TRÈS PRÉCISÉMENT la phase de jeu et les objectifs fournis. Chaque atelier doit découler du thème : interdit de proposer un exercice générique hors sujet. Tout le contenu doit être rédigé en français, détaillé et exploitable sans autre support.`,
  "UEFA A": `1. PRÉPARATION PHYSIQUE & ATHLÉTISATION — programmation de la charge physique de très haut niveau, périodisation, prévention des blessures, gestion de la récupération. Tu doses volume et intensité avec une précision professionnelle.
2. ANIMATION OFFENSIVE — principes avancés de construction, jeu de position, supériorités numériques, dézonage, permutations, transitions offensives rapides. Tu maîtrises les concepts les plus modernes du jeu.
3. ANIMATION DÉFENSIVE — pressing haut coordonné, lignes de force, défense en zone, contre-pressing, transitions défensives, gestion du bloc bas. Tu maîtrises les concepts avancés.
4. SYSTÈMES DE JEU — 4-2-3-1, 4-3-3, 3-5-2, 4-4-2, 5-3-2 et leurs variantes. Tu connais les automatismes de chaque système et les micro-détails qui font la différence au haut niveau.

Ton objectif : concevoir une séance complète de 90 minutes, claire et directement animable sur le terrain, qui suit TRÈS PRÉCISÉMENT la phase de jeu et les objectifs fournis. Chaque atelier doit découler du thème : interdit de proposer un exercice générique hors sujet. Tout le contenu doit être rédigé en français, détaillé et exploitable sans autre support.`,
};

function buildBasePersona(expertise: ExpertiseLevel): string {
  return `Tu es un entraîneur de football et préparateur physique.
${EXPERTISE_PERSONAS[expertise]}

Tu es un expert reconnu dans 4 domaines complémentaires :

${EXPERTISE_AREAS[expertise]}`;
}

const TACTICAL_INTRO = `### 🎯 PHASE TACTIQUE (animation offensive ou défensive)

Tu conçois une séance pour travailler la phase de jeu et les objectifs tactiques fournis. Construis une progression logique : de la situation la plus simple (échauffement en lien avec le thème) vers la plus proche du match (jeu réduit puis opposition). Si un système de jeu est fourni, ancre chaque exercice dedans : précise les rôles, les couloirs, les zones de déclenchement et les équilibres propres à ce système.`;

const ATHLETISATION_INTRO = `### 🎯 PHASE ATHLÉTISATION

L'athlétisation est une phase RÉCURRENTE qui intervient régulièrement APRÈS la préparation physique de reprise (2 à 3 semaines). Contrairement à la préparation physique — dont l'objectif est de remettre les joueurs en forme après une longue période sans sport —, les joueurs sont ici déjà en condition : l'athlétisation doit MAINTENIR et DÉVELOPPER les qualités physiques tout au long de la saison, en complément du travail tactique et technique, sans surentraînement ni charge excessive. Objectifs types : entretien de l'endurance de base, renforcement musculaire préventif, explosivité mesurée, mobilité et récupération. Adapte toujours la charge au calendrier (veille de match : travail léger de récupération).`;

const COMMON_RULES = `### 🛑 RÈGLES ET CONTRAINTES STRICTES

1. Durée totale de la séance : exactement 90 minutes.
2. Structure : exactement 4 sections (leur contenu exact dépend de la phase, voir le format de réponse ci-dessous).
3. Clarté : chaque section doit être suffisamment détaillée pour être animée sans autre support — organisation sur le terrain, consignes, critères de réussite, temps de travail et de récupération.
4. Cohérence : chaque atelier doit être en lien direct avec la phase de jeu et les objectifs demandés.
5. Durée par atelier : aucun exercice ou jeu ne doit dépasser 20 minutes (explications, passages et récupérations compris), sauf indication contraire dans le format de réponse de la phase.
6. IMPORTANT : Ta réponse doit contenir UNIQUEMENT un objet JSON valide. Pas de texte avant, pas de texte après, pas de commentaires. Commence directement par { et termine par }.
7. N'utilise JAMAIS de commentaires dans le JSON (// ou /* */), ils le rendent invalide.`;

const SCHEMATIC_GUIDE = `- "schematic" : décrit le dispositif à schématiser. "type" ∈ ["pitch", "zones", "grid", "circle", "corridor", "line", "none"] :
  - "zones" : atelier en zones/squares délimités (préciser combien et où).
  - "grid" : quadrillage d'ateliers (ex. 4 carrés côte à côte).
  - "circle" : dispositif circulaire (rond central, cercles de jeu).
  - "corridor" : couloir latéral ou vertical matérialisé.
  - "line" : ligne(s) de plots pour passes ou parcours.
  - "pitch" : jeu sur portion de terrain avec buts.
  - "none" : aucun schéma (ex. match libre ou retour au calme).
  "dimensions" : dimensions réelles du dispositif, "players" : effectif et répartition, "description" : une phrase décrivant visuellement le schéma.`;

const TACTICAL_SCHEMA = `### 📋 FORMAT DE RÉPONSE EXIGÉ (PHASE TACTIQUE)

Tu répondras UNIQUEMENT par un objet JSON valide (aucun texte avant/après, aucun bloc de code markdown) correspondant exactement au schéma suivant :

{
  "title": "titre de la séance (ex: Séance Perfectionnement — Conservation du ballon)",
  "phase": "phase de jeu demandée",
  "objective": "objectif(s) de la séance demandé(s)",
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
      "animation": "Déroulé simple étape par étape (1. ... 2. ... 3. ...) décrivant les déplacements des joueurs et la circulation du ballon en langage clair",
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
        { "label": "Consignes & Règles du jeu (adaptées au système de jeu demandé)", "text": "..." },
        { "label": "Objectifs tactiques clés (liés au thème et au système)", "text": "..." }
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
${SCHEMATIC_GUIDE}
- "animation" : pour chaque section (sauf le match), rédige un déroulé SIMPLE, étape par étape et numéroté (1. ... 2. ... 3. ...) qui décrit les déplacements des joueurs et la circulation du ballon en langage clair et sans jargon, comme si tu racontais le déroulé à voix haute à un jeune joueur. Max 6 étapes. C'est l'alternative simple au schéma pour bien comprendre l'atelier.
- "conseilsCoach" : exactement 3 points clés d'intervention pour l'entraîneur, sur quoi corriger en priorité.
- Si un système de jeu est fourni (ex. 4-3-3), les consignes du jeu tactique et du match doivent être ancrées dans ce système : rôles, couloirs, zones de déclenchement.`;

const ATHLETISATION_SCHEMA = `### 📋 FORMAT DE RÉPONSE EXIGÉ (PHASE ATHLÉTISATION)

Tu répondras UNIQUEMENT par un objet JSON valide (aucun texte avant/après, aucun bloc de code markdown) correspondant exactement au schéma suivant :

{
  "title": "titre de la séance (ex: Séance Athlétisation — Entretien de la condition physique)",
  "phase": "ATHLETISATION",
  "objective": "objectif(s) de reprise demandé(s)",
  "material": "matériel nécessaire (plots, cerceaux, échelle de rythme, chasubles, élastiques, médecine-ball, etc.)",
  "totalDuration": 90,
  "sections": [
    {
      "name": "1. ÉCHAUFFEMENT / MOBILISATION ARTICULAIRE",
      "duration": 15,
      "items": [
        { "label": "Descriptif & Organisation", "text": "..." },
        { "label": "Consignes & intensité", "text": "..." },
        { "label": "Critères de réussite", "text": "..." }
      ],
      "variants": ["variante 1", "variante 2"],
      "animation": "Déroulé simple étape par étape (1. ... 2. ... 3. ...) décrivant les déplacements des joueurs et le circuit en langage clair",
      "schematic": {
        "type": "circle",
        "dimensions": "Carré central 15x15m",
        "players": "Tout l'effectif en cercle",
        "description": "Mobilisation dynamique en cercle puis en déplacement"
      }
    },
    {
      "name": "2. DÉVELOPPEMENT AÉROBIE / ENDURANCE DE BASE",
      "duration": 25,
      "items": [
        { "label": "Descriptif & Organisation", "text": "..." },
        { "label": "Consignes (allure, échelle d'intensité, FC cible)", "text": "..." },
        { "label": "Critères de réussite", "text": "..." }
      ],
      "variants": ["variante 1", "variante 2"],
      "schematic": {
        "type": "line",
        "dimensions": "Parcours 300-400m",
        "players": "Groupes de 6-8 joueurs",
        "description": "Footing continu ou fartlek doux sur un parcours balisé"
      }
    },
    {
      "name": "3. ATHLÉTISATION GÉNÉRALE / RENFORCEMENT",
      "duration": 30,
      "items": [
        { "label": "Circuit & Organisation (6 à 8 ateliers)", "text": "..." },
        { "label": "Consignes (temps de travail / récupération)", "text": "..." },
        { "label": "Critères de réussite", "text": "..." }
      ],
      "variants": ["variante 1", "variante 2"],
      "schematic": {
        "type": "grid",
        "dimensions": "20x20m",
        "players": "Groupes de 3-4 joueurs par atelier",
        "description": "Circuit de renforcement poids du corps réparti en stations"
      }
    },
    {
      "name": "4. RETOUR AU CALME / ÉTIREMENTS",
      "duration": 20,
      "items": [
        { "label": "Contenu", "text": "Footing léger, étirements, bilan avec les joueurs" }
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
  "conseilsCoach": ["point clé 1", "point clé 2", "point clé 3"]
}

Contraintes sur le JSON :
- "totalDuration" doit être exactement 90.
- La somme des "duration" de "sections" doit être exactement 90.
- "sections" contient EXACTEMENT 4 sections, dans l'ordre ci-dessus.
- C'est une phase récurrente d'entretien/développement après la préparation physique de 2 à 3 semaines : intensité modérée, adaptée au calendrier (veille de match = travail léger), priorité à la prévention des blessures.
- "variants" : 2 à 3 variantes ou progressions pour les 3 premières sections.
${SCHEMATIC_GUIDE}
- "animation" : pour chaque section (sauf le retour au calme), rédige un déroulé SIMPLE, étape par étape et numéroté (1. ... 2. ... 3. ...) qui décrit les déplacements des joueurs et le circuit en langage clair et sans jargon. Max 6 étapes. C'est l'alternative simple au schéma pour bien comprendre l'atelier.
- "conseilsCoach" : exactement 3 points clés pour l'entraîneur (bienveillance, corrections de gestuelle, progression de la charge).`;

function buildSystemPrompt(phase: string, expertise: ExpertiseLevel = "UEFA B"): string {
  const isAthletisation = phase === "ATHLETISATION";
  return `${buildBasePersona(expertise)}

---

${isAthletisation ? ATHLETISATION_INTRO : TACTICAL_INTRO}

---

${COMMON_RULES}

---

${isAthletisation ? ATHLETISATION_SCHEMA : TACTICAL_SCHEMA}`;
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
            animation: typeof s?.animation === "string" ? s.animation : "",
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
  playerCount: number | null,
  systeme?: FootballSystem,
  expertise: ExpertiseLevel = "UEFA B"
): Promise<AISession> {
  const objectiveText = objectives.map((o) => `- ${o}`).join("\n");
  const userContent = [
    `Phase de jeu : ${phase}`,
    `Objectif(s) de la séance :\n${objectiveText}`,
    systeme
      ? `Système de jeu de l'équipe : ${systeme}. Adapte l'animation offensive/défensive à ce système (rôles, couloirs, zones de déclenchement).`
      : "",
    playerCount ? `Contexte : ${playerCount} joueurs présents à la séance.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const correction = `
Correction : la réponse précédente ne respectait pas les contraintes (la somme des durées des sections doit être exactement 90, et les sections doivent correspondre au format demandé pour la phase "${phase}"). Corrige et renvoie uniquement un objet JSON valide, sans texte autour.`;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = await callAI(
        buildSystemPrompt(phase, expertise),
        attempt === 0 ? userContent : userContent + correction,
        { temperature: 0.7, maxTokens: 4096, responseFormat: "json" }
      );
      const session = parseAISession(content);
      const sum = session.sections.reduce((a, s) => a + s.duration, 0);
      if (sum === 90) return session;
      lastError = new Error("Réponse IA non conforme (durées ≠ 90)");
    } catch (e) {
      lastError = e instanceof Error ? e : new Error("Réponse IA invalide");
    }
  }
  throw lastError;
}
