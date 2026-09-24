import { normalizeDofaCollection } from "./normalize";
import { parseDofaMatches, type DofaMatch } from "./parse-matches";
import type { DofaPouleRef } from "./types";

/**
 * Journée officielle de la poule DOFA, telle que collée depuis le site.
 *
 * Éléments extraits de la ressource `PouleJournee` (`poule_journees`,
 * enveloppe Hydra `{ "hydra:member": [...] }`) :
 *   - `number`             : numéro de la journée (obligatoire, entier >= 1).
 *   - `name`               : libellé affiché par le site (ex. "Journée 1"),
 *                            neutralisé (HTML/JS) — `null` si absent.
 *   - `date`               : date officielle de la journée (`_date`), ISO
 *                            conservée telle quelle — `null` si absente.
 *
 * Seuls ces trois champs sont conservés : la liste sert à ÉTIQUETER les
 * matchs du championnat (groupement de `PouleResultsCard`), rien d'autre.
 * On ne stocke ni `pj_no_tour`/`pj_lib_tour`, ni `pj_dat_class_*` (classification
 * automatique/officielle).
 *
 * ⚠️ Embarquement des matchs (`matchs`/`matches`) : lorsque le payload de la
 * page `poule_journees` contient, pour une journée, les MATCHES de la poule
 * (objets complets, ex. page « Journées » ouverte avec la ressource matchs
 * développée via `details[]`), ils sont extraits et importés en base en même
 * temps que les étiquettes — c'est le moyen d'importer TOUS les matchs de
 * TOUTES les journées (y compris ceux où l'équipe suivie ne joue pas), au
 * lieu de se limiter aux seuls matchs de l'équipe suivie ramenés par le
 * collage « Ouvrir mes matchs ». La liste seule (sans matchs) reste acceptée
 * telle quelle, comme avant.
 */
export interface DofaJournee {
  number: number;
  name: string | null;
  date: string | null;
}

/**
 * Triplet déclaré par un item de la page `poule_journees`, reconstruit à
 * partir de `competition.cp_no`, `phase.number` et `poule.stage_number` —
 * les mêmes clés que celles d'un objet `DofaRawMatch`. Sert d'ancre anti-
 * injection pour les matchs embarqués (cf. `validateJourneesPayload`).
 */
export type DofaJourneeTriplet = DofaPouleRef;

/**
 * Plafonds de la liste des journées collée par le coach. Une poule (double
 * aller/retour) compte au plus 2×(nombre d'équipes − 1) journées : 34 pour
 * 18 équipes, en incluant les phases finales éventuelles on reste très en
 * dessous de 80. 256 Ko couvrent le cas d'une enveloppe Hydra verbeuse.
 *
 * `MAX_JOURNEES_MATCHES` borne le nombre total de matchs embarqués à
 * importer d'un coup — aligné sur le plafond de l'ingestion des matchs
 * (`MAX_INGEST_MATCHES`) : une saison complète d'une poule de 14 équipes
 * compte 182 confrontations, très en dessous.
 */
export const MAX_JOURNEES = 80;
export const MAX_JOURNEES_BYTES = 256 * 1024;
export const MAX_JOURNEES_MATCHES = 500;

export interface ValidateJourneesPayloadInput {
  /** Corps brut JSON, avant parse, pour le contrôle de taille. */
  rawBody: string;
}

export type JourneesValidationFailureReason =
  | "invalid_json"
  | "invalid_shape"
  | "too_many_journees"
  | "payload_too_large"
  | "invalid_journees"
  | "duplicate_journees"
  | "invalid_matchs"
  | "too_many_matchs"
  | "triplet_mismatch";

export type JourneesValidationResult =
  | { ok: true; journees: DofaJournee[]; matches: DofaMatch[]; triplet: DofaJourneeTriplet | null }
  | { ok: false; reason: JourneesValidationFailureReason; message: string };

/** Même neutralisation que l'ingestion de matchs : suppression des balises
 * HTML et des schémas javascript:, car ces libellés sont un contenu TIERS
 * stocké en base et réutilisé hors du rendu React. */
function neutralizeHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "");
}

/**
 * Extrait la date officielle d'une journée brute. Priorité à `_date` (date
 * de la journée), puis `pj_dat_class_offi` (date de la classification
 * officielle) — jamais une date de classification automatique (`pj_dat_class_auto`).
 * Ne lève jamais d'exception : toute absence → `null`.
 */
function extractJournalDate(raw: Record<string, unknown>): string | null {
  for (const key of ["_date", "pj_dat_class_offi"] as const) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

/**
 * Parse une collection brute `poule_journees` (tableau nu ou enveloppe
 * Hydra, via `normalizeDofaCollection`) en `DofaJournee[]`. Fonction pure,
 * jamais d'exception : un élément sans `number` exploitable est ignoré.
 */
export function parsePouleJournees(data: unknown): DofaJournee[] {
  const items = normalizeDofaCollection(data);
  const journees: DofaJournee[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;

    const number = raw.number;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 1) continue;

    const name = typeof raw.name === "string" && raw.name.trim() ? neutralizeHtml(raw.name) : null;

    journees.push({ number, name, date: extractJournalDate(raw) });
  }

  return journees;
}

/**
 * Extrait les matchs d'un item de la page `poule_journees`.
 *
 * Seuls les matchs **objets** (déjà développés, ex. chargés via `details[]`)
 * sont retenus : une liste d'IRI (`"/api/.../matchs/1"`) n'est pas une donnée
 * exploitable d'import et est ignorée, comme avant. Fonction pure, jamais
 * d'exception.
 */
function extractEmbeddedMatchItems(raw: Record<string, unknown>): unknown[] {
  for (const key of ["matchs", "matches"] as const) {
    const value = raw[key];
    if (Array.isArray(value)) {
      const objects = value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
      if (objects.length > 0) return objects;
    }
  }
  return [];
}

/** Extrait le triplet déclaré d'un item (competition.cp_no + phase.number + poule.stage_number), ou null. */
function extractDeclaredTriplet(raw: Record<string, unknown>): DofaJourneeTriplet | null {
  const competition = raw.competition as Record<string, unknown> | undefined;
  const phase = raw.phase as Record<string, unknown> | undefined;
  const poule = raw.poule as Record<string, unknown> | undefined;
  const cpNo = competition?.cp_no;
  const phaseNumber = phase?.number;
  const stage = poule?.stage_number;
  if (
    typeof cpNo !== "number" ||
    typeof phaseNumber !== "number" ||
    typeof stage !== "number"
  ) {
    return null;
  }
  return { cp_no: cpNo, phase: phaseNumber, poule: stage };
}

/**
 * Parse les matchs embarqués d'un lot `poule_journees` et les rattache à leur
 * journée (le `matchday` est repris de la journée parente lorsque le match
 * embarqué n'en porte pas — cas des objets développés sans `poule_journee`
 * imbriquée).
 */
function parseEmbeddedMatches(journeesItems: Record<string, unknown>[]): {
  matches: DofaMatch[];
  rawCount: number;
} {
  const matches: DofaMatch[] = [];
  let rawCount = 0;

  for (const item of journeesItems) {
    const rawMatches = extractEmbeddedMatchItems(item);
    if (rawMatches.length === 0) continue;

    const parsed = parseDofaMatches(rawMatches);
    const journeeNumber = typeof item.number === "number" && Number.isInteger(item.number) ? item.number : null;
    for (const match of parsed) {
      matches.push(
        match.matchday !== null ? match : { ...match, matchday: journeeNumber }
      );
    }
    rawCount += rawMatches.length;
  }

  return { matches, rawCount };
}

/**
 * Validation de la liste collée. FONCTION PURE — même contrat de confiance
 * que `validateIngestPayload` (lot 7) : le payload arrive du navigateur du
 * coach, qui l'a lui-même reçu du site tiers FFF. Rien ne garantit son
 * origine ni son intégrité → rejet strict de tout ce qui s'écarte du
 * contrat, jamais d'acceptation d'un sous-ensemble en silence.
 *
 * Contrat (chaque étape peut court-circuiter) :
 *   1. `JSON.parse` réussit.
 *   2. Forme : tableau nu OU enveloppe Hydra.
 *   3. Nombre d'éléments <= MAX_JOURNEES.
 *   4. Taille brute <= MAX_JOURNEES_BYTES.
 *   5. Parse via `parsePouleJournees` : si le nombre de journées valides
 *      diffère du nombre d'éléments bruts (un item a été ignoré car taxé
 *      d'un `number` invalide) → rejet global, jamais de sous-ensemble.
 *   6. Aucun numéro dupliqué (une journée ne peut pas apparaître deux fois).
 *   7. Tri par numéro (ordre calendaire déterministe, quel que soit l'ordre
 *      de la réponse collée).
 *   8. Matchs embarqués (`matchs`/`matches` par journée) : chaque objet
 *      match doit être parsable (rejet global sinon), le total est borné par
 *      MAX_JOURNEES_MATCHES, et le triplet déclaré des journées doit exister
 *      et être unique (ancre anti-injection pour les matchs importés).
 */
export function validateJourneesPayload(
  input: ValidateJourneesPayloadInput
): JourneesValidationResult {
  const { rawBody } = input;

  // 1. JSON valide.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "invalid_json", message: "Le corps de la requête n'est pas un JSON valide." };
  }

  // 2. Forme attendue : tableau nu ou enveloppe Hydra.
  let items: unknown[];
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>)["hydra:member"])
  ) {
    items = (parsed as Record<string, unknown>)["hydra:member"] as unknown[];
  } else {
    return {
      ok: false,
      reason: "invalid_shape",
      message: "Le payload doit être un tableau de journées (ou une enveloppe Hydra).",
    };
  }

  // 3. Volume — vérifié avant la taille brute (un lot trop grand doit être
  //    signalé comme tel, même si sa taille dépasse aussi le seuil d'octets).
  if (items.length > MAX_JOURNEES) {
    return {
      ok: false,
      reason: "too_many_journees",
      message: `Le payload dépasse la limite de ${MAX_JOURNEES} journées.`,
    };
  }

  // 4. Taille brute — vérifiée après le nombre d'éléments.
  if (Buffer.byteLength(rawBody, "utf8") > MAX_JOURNEES_BYTES) {
    return {
      ok: false,
      reason: "payload_too_large",
      message: "Le payload dépasse la taille maximale autorisée (256 Ko).",
    };
  }

  // 5. Parse strict : aucun sous-ensemble accepté en silence.
  const journees = parsePouleJournees(items);
  if (journees.length !== items.length) {
    return {
      ok: false,
      reason: "invalid_journees",
      message: "Une ou plusieurs journées du payload sont invalides (numéro absent ou malformé).",
    };
  }

  // 6. Numéros uniques.
  const seen = new Set<number>();
  for (const journee of journees) {
    if (seen.has(journee.number)) {
      return {
        ok: false,
        reason: "duplicate_journees",
        message: `La journée ${journee.number} apparaît plusieurs fois dans le payload.`,
      };
    }
    seen.add(journee.number);
  }

  // 7. Tri par numéro (ordre calendaire déterministe, quel que soit l'ordre
  //    de la réponse collée).
  journees.sort((a, b) => a.number - b.number);

  // 8. Matchs embarqués dans les journées. Un payload sans objet match est un
  //    étiquetage pur (comportement historique) : pas de contrainte ajoutée.
  const rawItemsTyped = items as Record<string, unknown>[];
  const { matches, rawCount } = parseEmbeddedMatches(rawItemsTyped);

  if (rawCount > 0) {
    if (matches.length !== rawCount) {
      return {
        ok: false,
        reason: "invalid_matchs",
        message: "Un ou plusieurs matchs embarqués dans les journées sont invalides (structure inattendue).",
      };
    }

    if (matches.length > MAX_JOURNEES_MATCHES) {
      return {
        ok: false,
        reason: "too_many_matchs",
        message: `Le payload dépasse la limite de ${MAX_JOURNEES_MATCHES} matchs embarqués.`,
      };
    }

    // Ancre anti-injection : le triplet déclaré par les journées doit exister
    // et être identique sur tout le lot (les matchs embarqués ne portent pas
    // nécessairement le triplet — c'est le contexte journée qui les ancre).
    const declaredTriplets = new Set<string>();
    for (const item of rawItemsTyped) {
      const declared = extractDeclaredTriplet(item);
      if (declared) declaredTriplets.add(`${declared.cp_no}/${declared.phase}/${declared.poule}`);
    }
    if (declaredTriplets.size !== 1) {
      return {
        ok: false,
        reason: "triplet_mismatch",
        message: "Impossible de rattacher les matchs embarqués à une poule unique (triplet absent ou incohérent).",
      };
    }

    const [cpNo, phase, poule] = Array.from(declaredTriplets)[0].split("/").map(Number);
    return { ok: true, journees, matches, triplet: { cp_no: cpNo, phase, poule } };
  }

  return { ok: true, journees, matches, triplet: null };
}