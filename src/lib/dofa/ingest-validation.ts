/**
 * ingest-validation.ts — LOT 7 (endpoint d'ingestion sécurisé)
 *
 * ⚠️ Point le plus sensible du chantier : le payload validé ici provient du
 * navigateur du coach (bookmarklet, lot 8), lui-même relayé depuis un site
 * tiers (FFF/DOFA). Rien ne garantit qu'il vient réellement de la FFF, ni
 * qu'il n'a pas été altéré en transit ou fabriqué de toutes pièces.
 *
 * `validateIngestPayload` est la seule frontière de confiance avant écriture
 * en base : fonction PURE (aucune I/O), qui rejette strictement tout ce qui
 * s'écarte du contrat attendu plutôt que d'accepter un sous-ensemble en
 * silence.
 */

import { parseDofaMatches, type DofaMatch } from "./parse-matches";
import type { DofaPouleRef } from "./types";

export const MAX_INGEST_MATCHES = 500;
/**
 * 1,5 Mo (1.5 * 1024 * 1024 octets). Mesures réelles sur données DOFA brutes
 * (le bookmarklet transmet désormais le JSON brut, sans allègement côté
 * client — voir plus bas) : une journée pèse ~29 Ko, une saison complète
 * entre ~645 Ko (12 équipes) et ~889 Ko (14 équipes). 512 Ko était donc déjà
 * insuffisant pour une saison complète ; 1,5 Mo conserve une marge
 * confortable sans ouvrir la porte à un payload démesuré.
 */
export const MAX_INGEST_BYTES = 1.5 * 1024 * 1024;

/**
 * ── Format d'échange allégé (bookmarklet, lot 8 — conservé pour compat) ───
 *
 * Le JSON brut renvoyé par l'API DOFA répète intégralement `competition`,
 * `phase`, `poule`, `engagements`, les logos et `external_updated_at` sur
 * CHAQUE match (~5 Ko/match en conditions réelles). Le bookmarklet transmet
 * désormais ce JSON brut tel quel (décision produit : la normalisation est
 * un travail serveur, pas la peine de le dupliquer côté client) — mais le
 * format allégé décrit ci-dessous reste accepté par le serveur, qui VALIDE
 * les deux formes sans en IMPOSER une seule : une garantie de compatibilité
 * utile, pas du code mort.
 *
 * Champs conservés par match, et pourquoi :
 *   - `ma_no`                         : identifiant du match (obligatoire).
 *   - `date`, `time`                  : date/heure du coup d'envoi.
 *   - `home_score`, `away_score`      : score courant.
 *   - `home_is_forfeit`, `away_is_forfeit`, `seems_postponed`, `status`
 *                                     : états du match.
 *   - `poule_journee.number`          : numéro de journée (poule_journee.name
 *                                       n'est pas exploité par parseDofaMatches).
 *   - `home.club.cl_no`, `home.number`, `home.short_name` (idem `away`)
 *                                     : identité minimale d'équipe — SANS
 *                                       `logo`, `category_*`, `code`, `type`.
 *   - `terrain.name`, `.address`, `.zip_code`, `.city` (nullable)
 *                                     : lieu — SANS `te_no`, `libelle_surface`.
 *   - `competition.cp_no`, `phase.number`, `poule.stage_number`
 *                                     : 🔒 CONSERVÉS SUR CHAQUE MATCH bien
 *                                       qu'ils ne pèsent que quelques
 *                                       octets, car c'est CE triplet qui est
 *                                       comparé à `input.triplet` (étape 7
 *                                       de `validateIngestPayload`) pour
 *                                       empêcher l'injection de matchs
 *                                       appartenant à une autre poule dans
 *                                       le championnat suivi. Retirer ces
 *                                       identifiants romprait la garantie
 *                                       de sécurité anti-injection.
 *
 * Champs explicitement EXCLUS du format allégé (jamais requis par
 * `parseDofaMatches`, ni par la validation) : `competition.name`, `.season`,
 * `.type`, `.level`, `.cdg`, `phase.type`, `.name`, `poule.name`,
 * `.poule_unique`, `.at_least_one_match_resultat`, `poule_journee.name`,
 * `*.club.logo`, `*.category_code`, `*.category_label`, `*.category_gender`,
 * `*.code`, `*.type`, `terrain.te_no`, `.libelle_surface`, `season`,
 * `ma_inver`, `ma_arret`, `is_overtime`, `initial_date`, `home_resu`,
 * `away_resu`, `match_membres`, `match_feuille`, `status_label`, ainsi que
 * tout `external_updated_at` éventuel.
 *
 * La structure imbriquée (`home.club.cl_no`, `poule_journee.number`, etc.)
 * est préservée à l'identique de sorte que `parseDofaMatches` (lot 2)
 * fonctionne SANS AUCUNE MODIFICATION sur ce format allégé, exactement
 * comme sur le format brut complet. Voir
 * `__fixtures__/ingest-slim-d4-pouleD.json` pour un exemple concret.
 */

export interface ValidateIngestPayloadInput {
  /** Corps brut JSON, avant parse, pour le contrôle de taille. */
  rawBody: string;
  /** Triplet déclaré par l'appelant (coach). */
  triplet: DofaPouleRef;
}

export type IngestValidationFailureReason =
  | "invalid_json"
  | "invalid_shape"
  | "payload_too_large"
  | "too_many_matches"
  | "invalid_matches"
  | "triplet_mismatch";

export type IngestValidationResult =
  | { ok: true; matches: DofaMatch[] }
  | { ok: false; reason: IngestValidationFailureReason; message: string };

/**
 * Neutralise le HTML/JS potentiellement injecté dans une valeur destinée à
 * être affichée en UI (`short_name`, `terrain.name`).
 *
 * Choix retenu : SUPPRESSION des balises HTML (plutôt qu'échappement des
 * entités `< > &`), car :
 *   - ces champs sont de simples libellés (nom d'équipe, nom de terrain) —
 *     aucune balise n'y a de sens légitime, contrairement à un champ texte
 *     riche où l'échappement serait préférable pour préserver le contenu ;
 *   - la suppression élimine en un seul passage à la fois les balises
 *     (`<script>`, `<img>`, `<b onclick=...>`) et les attributs qu'elles
 *     portent (`onerror=`, `onclick=`), sans avoir à maintenir une liste
 *     d'attributs dangereux à filtrer séparément ;
 *   - on ne s'appuie PAS sur l'échappement automatique de React/Next au
 *     rendu : cette valeur est un contenu TIERS stocké en base, qui peut
 *     être réutilisé hors du rendu React (export, notification, log) — la
 *     neutralisation doit donc avoir lieu à l'ingestion, pas seulement à
 *     l'affichage.
 * Un schéma `javascript:` (sans balise associée) est retiré séparément, car
 * il peut survivre à la suppression de balises s'il n'est pas imbriqué dans
 * un attribut de balise (ex. valeur brute `"javascript:alert(1)"`).
 */
function neutralizeHtml(value: string): string {
  const withoutTags = value.replace(/<[^>]*>/g, "");
  return withoutTags.replace(/javascript:/gi, "");
}

function sanitizeMatch(match: DofaMatch): DofaMatch {
  return {
    ...match,
    homeTeam: { ...match.homeTeam, shortName: neutralizeHtml(match.homeTeam.shortName) },
    awayTeam: { ...match.awayTeam, shortName: neutralizeHtml(match.awayTeam.shortName) },
    location: match.location
      ? {
          ...match.location,
          name: match.location.name !== null ? neutralizeHtml(match.location.name) : null,
        }
      : match.location,
  };
}

/** Extrait le triplet cp_no/phase/poule d'un élément brut, si présent. */
function extractRawTriplet(raw: Record<string, unknown>): Partial<DofaPouleRef> {
  const competition = raw.competition as Record<string, unknown> | undefined;
  const phase = raw.phase as Record<string, unknown> | undefined;
  const poule = raw.poule as Record<string, unknown> | undefined;
  return {
    cp_no: competition?.cp_no as number | undefined,
    phase: phase?.number as number | undefined,
    poule: poule?.stage_number as number | undefined,
  };
}

export function validateIngestPayload(
  input: ValidateIngestPayloadInput
): IngestValidationResult {
  const { rawBody, triplet } = input;

  // 1. JSON valide.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: "invalid_json", message: "Le corps de la requête n'est pas un JSON valide." };
  }

  // 2. Forme attendue : tableau nu ou enveloppe Hydra { "hydra:member": [...] }.
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
      message: "Le payload doit être un tableau de matchs (ou une enveloppe Hydra).",
    };
  }

  // 3. Volume (nombre d'éléments) — vérifié avant la taille brute : un lot
  //    de plus de 500 matchs doit être signalé comme "too_many_matches"
  //    même si sa taille dépasse également le seuil d'octets.
  if (items.length > MAX_INGEST_MATCHES) {
    return {
      ok: false,
      reason: "too_many_matches",
      message: `Le payload dépasse la limite de ${MAX_INGEST_MATCHES} matchs.`,
    };
  }

  // 4. Taille brute. Vérifiée après le nombre d'éléments : protège contre
  //    un contenu anormalement volumineux (champ de padding, injection de
  //    texte massif) sans pénaliser un lot légitime de matchs nombreux mais
  //    dans la limite de volume.
  if (Buffer.byteLength(rawBody, "utf8") > MAX_INGEST_BYTES) {
    return {
      ok: false,
      reason: "payload_too_large",
      message: "Le payload dépasse la taille maximale autorisée (1,5 Mo).",
    };
  }

  // 5. Parse via parseDofaMatches (lot 2). Aucun sous-ensemble accepté en
  //    silence : si le parseur a ignoré un élément, on rejette tout le lot.
  const matches = parseDofaMatches(items);
  if (matches.length !== items.length) {
    return {
      ok: false,
      reason: "invalid_matches",
      message: "Un ou plusieurs matchs du payload sont invalides (structure inattendue).",
    };
  }

  // 6. Date parsable pour chaque match.
  for (const match of matches) {
    if (Number.isNaN(Date.parse(match.date))) {
      return {
        ok: false,
        reason: "invalid_matches",
        message: "Un ou plusieurs matchs du payload ont une date invalide.",
      };
    }
  }

  // 7. Cohérence du triplet : tous les matchs doivent appartenir au triplet
  //    déclaré par l'appelant, sinon rejet global (anti-injection de poule).
  for (const raw of items as Record<string, unknown>[]) {
    const rawTriplet = extractRawTriplet(raw);
    if (
      rawTriplet.cp_no !== triplet.cp_no ||
      rawTriplet.phase !== triplet.phase ||
      rawTriplet.poule !== triplet.poule
    ) {
      return {
        ok: false,
        reason: "triplet_mismatch",
        message: "Un ou plusieurs matchs n'appartiennent pas au triplet de poule déclaré.",
      };
    }
  }

  // 8 & 9. Neutralisation HTML/JS + exclusion des clés inconnues : déjà
  // garanti par le mapping strict de `parseDofaMatches` (seuls les champs
  // connus de `DofaMatch` sont produits), on ne fait ici que sanitiser les
  // champs textuels destinés à l'affichage.
  return { ok: true, matches: matches.map(sanitizeMatch) };
}
