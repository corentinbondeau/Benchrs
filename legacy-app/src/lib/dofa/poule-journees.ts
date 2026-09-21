import { normalizeDofaCollection } from "./normalize";

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
 * automatique/officielle), ni `matchs` (redondant avec championship_standings).
 */
export interface DofaJournee {
  number: number;
  name: string | null;
  date: string | null;
}

/**
 * Plafonds de la liste des journées collée par le coach. Une poule (double
 * aller/retour) compte au plus 2×(nombre d'équipes − 1) journées : 34 pour
 * 18 équipes, en incluant les phases finales éventuelles on reste très en
 * dessous de 80. 256 Ko couvrent le cas d'une enveloppe Hydra verbeuse.
 */
export const MAX_JOURNEES = 80;
export const MAX_JOURNEES_BYTES = 256 * 1024;

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
  | "duplicate_journees";

export type JourneesValidationResult =
  | { ok: true; journees: DofaJournee[] }
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

  return { ok: true, journees };
}