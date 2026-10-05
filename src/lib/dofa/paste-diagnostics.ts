/**
 * paste-diagnostics.ts — pourquoi un collage DOFA est refusé
 *
 * Le serveur (`validateIngestPayload` → POST /api/championships/dofa/ingest)
 * renvoie volontairement un message générique (« Le payload transmis est
 * invalide ») : c'est une frontière de confiance, chaque motif de refus doit
 * rester dans les logs serveur et ne jamais être exposé tel quel.
 *
 * Conséquence pour le coach : un simple « invalide » ne dit pas *quel* est le
 * problème, alors que les causes réelles sont presque toutesdevilement
 * détectables AVANT l'appel réseau, sur les données que le coach a lui-même
 * collées (donc aucune fuite : on ne parle que de son propre collage).
 *
 * Ce module réplique donc, en pur et sans dépendance serveur, les trois
 * motifs les plus fréquents :
 *   - `no_matches`         : le contenu collé n'est pas une liste de matchs
 *                            (page « Classement », liste des « journées », …) ;
 *   - `partial_matches`    : certains matchs n'ont pas pu être lus ;
 *   - `triplet_mismatch`   : les matchs collés sont d'une AUTRE poule que
 *                            celle configurée sur le championnat.
 *
 * Volontairement distinct de `ingest-validation.ts` : pas de `Buffer`, pas de
 * limite d'octets, aucune décision d'écriture — uniquement un libellé
 * actionnable. Le serveur reste seul juge (et peut refuser pour des raisons
 * que le client ne voit pas).
 */

import { parseDofaMatches } from "./parse-matches";
import type { DofaPouleRef } from "./types";

export type PasteProblemCode = "no_matches" | "partial_matches" | "triplet_mismatch";

export interface PasteProblem {
  code: PasteProblemCode;
  /** Message actionnable, à afficher tel quel au coach. */
  message: string;
}

/**
 * Extrait le triplet `cp_no`/`phase`/`poule` d'un élément brut DOFA.
 * Duplique volontairement `extractRawTriplet` (non exporté par
 * `ingest-validation.ts`) plutôt que d'exporter une fonction serveur vers le
 * client : les deux modules restent indépendants.
 */
function readRawTriplet(raw: Record<string, unknown>): Partial<DofaPouleRef> {
  const competition = raw.competition as Record<string, unknown> | undefined;
  const phase = raw.phase as Record<string, unknown> | undefined;
  const poule = raw.poule as Record<string, unknown> | undefined;
  return {
    cp_no: competition?.cp_no as number | undefined,
    phase: phase?.number as number | undefined,
    poule: poule?.stage_number as number | undefined,
  };
}

/**
 * Analyse un collage déjàparsé en tableau de matchs DOFA.
 *
 * @param items         contenu de `hydra:member` (ou le tableau nu)
 * @param expected      triplet configuré sur le championnat
 * @returns `null` si rien d'anormal n'est détectable — l'appel au serveur
 *          reste alors nécessaire (seul lui applique les autres contrôles :
 *          taille, limite de matchs, cohérence stricte).
 */
export function diagnoseDofaPaste(
  items: unknown[],
  expected: DofaPouleRef
): PasteProblem | null {
  const records = items.filter(
    (item): item is Record<string, unknown> => !!item && typeof item === "object"
  );

  // Aucun match lisible : le plus souvent une mauvaise page collée.
  const matches = parseDofaMatches(records);
  if (matches.length === 0) {
    return {
      code: "no_matches",
      message:
        "Aucun match exploitable dans ce contenu. Vous avez probablement collé une autre page que celle des matchs (par exemple « Classement » ou la liste des « journées »). Ouvrez le lien « Ouvrir mes matchs », faites Ctrl+A puis Ctrl+C, et collez de nouveau.",
    };
  }

  // Certains matchs seulement illisibles : le collage est partiel ou tronqué.
  if (matches.length !== items.length) {
    return {
      code: "partial_matches",
      message: `Seulement ${matches.length} matchs sur ${items.length} ont pu être lus dans ce contenu (numéro de match ou équipes manquants). Re-vérifiez que vous avez collé toute la page « Matchs », sans la tronquer.`,
    };
  }

  // Cohérence de poule : un écart ici est la cause la plus fréquente d'un
  // refus serveur, car le triplet configuré et celui des matchs doivent être
  // strictement identiques.
  const mismatched = records.find((raw) => {
    const triplet = readRawTriplet(raw);
    return (
      triplet.cp_no !== expected.cp_no ||
      triplet.phase !== expected.phase ||
      triplet.poule !== expected.poule
    );
  });

  if (mismatched) {
    const found = readRawTriplet(mismatched);
    const describe = (value: number | undefined) => (value ?? "?");
    return {
      code: "triplet_mismatch",
      message: `Les matchs collés appartiennent à la compétition ${describe(found.cp_no)}, phase ${describe(found.phase)}, poule ${describe(found.poule)} — mais ce championnat est configuré sur la phase ${expected.phase}, poule ${expected.poule}. Reconfigurez la poule ci-dessus, ou collez la page de la bonne poule.`,
    };
  }

  return null;
}