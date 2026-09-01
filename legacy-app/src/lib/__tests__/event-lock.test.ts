/**
 * Tests TDD — isEventLocked & getEventDurationMinutes (Phase RED)
 *
 * Feature cible : les évènements disposent désormais d'une heure de fin
 * optionnelle (`end_date`), saisie via un champ date+heure et pré-remplie à
 * `event_date + 2h` (match) ou `event_date + 1h30` (entraînement). Quand
 * elle est renseignée, `end_date` devient la référence de fin RÉELLE de
 * l'évènement, en remplacement de l'approximation actuelle « début + 3h ».
 *
 * Règles métier couvertes (isEventLocked) :
 *   - Sans `endDate` : comportement inchangé, repli sur `event_date + 3h`
 *     (EVENT_LOCK_GRACE_MS). C'est la non-régression la plus critique :
 *     tous les appelants actuels de isEventLocked(eventDate) ne passent
 *     jamais de endDate et ne doivent voir AUCUN changement de comportement.
 *   - `endDate` renseignée et dépassée => verrouillé, même si
 *     `event_date + 3h` n'est pas encore atteint (évènement plus long que
 *     3h, ex: tournoi).
 *   - `endDate` renseignée et non atteinte => NON verrouillé, même si
 *     `event_date + 3h` est dépassé (évènement long en cours).
 *   - `endDate` invalide ou null => repli sur la règle des 3h, sans
 *     exception.
 *   - `eventDate` nul/invalide => false, comportement actuel préservé.
 *
 * Règles métier couvertes (getEventDurationMinutes) :
 *   - Durée normale calculée en minutes entre eventDate et endDate.
 *   - endDate absente => null.
 *   - endDate antérieure ou égale au début => null (incohérent).
 *   - dates invalides => null, sans exception.
 */

import { describe, it, expect } from "vitest";

import {
  isEventLocked,
  isLockedForRole,
  getEventDurationMinutes,
  shiftEndDate,
  applyDurationToStart,
  EVENT_LOCK_GRACE_MS,
} from "@/lib/event-lock";

const NOW = new Date("2026-08-26T12:00:00.000Z").getTime();

describe("isEventLocked", () => {
  // ==== CAS 1 — NON-RÉGRESSION : sans endDate, verrouillé 4h après le début ====
  it("verrouille un évènement sans endDate commencé il y a 4h (règle des 3h inchangée)", () => {
    const eventDate = new Date(NOW - 4 * 60 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDate, null, NOW)).toBe(true);
  });

  // ==== CAS 2 — NON-RÉGRESSION : sans endDate, pas verrouillé 1h après le début ====
  it("ne verrouille pas un évènement sans endDate commencé il y a 1h (règle des 3h inchangée)", () => {
    const eventDate = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDate, null, NOW)).toBe(false);
  });

  // ==== CAS 3 — NON-RÉGRESSION : sans passer endDate du tout (appel à 2 arguments comme avant) ====
  it("conserve le comportement historique quand endDate n'est pas fourni du tout", () => {
    const eventDate = new Date(NOW - 4 * 60 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDate, undefined, NOW)).toBe(true);
    const eventDateRecent = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDateRecent, undefined, NOW)).toBe(false);
  });

  // ==== CAS 4 — ERREUR MÉTIER : évènement long, endDate dépassée alors que +3h ne l'est pas ====
  // Début il y a 1h, fin il y a 10 min : la fin réelle est passée, verrouillé,
  // même si event_date + 3h est encore loin devant.
  it("verrouille un évènement dont endDate est dépassée, même si event_date + 3h ne l'est pas encore", () => {
    const eventDate = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(NOW - 10 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDate, endDate, NOW)).toBe(true);
  });

  // ==== CAS 5 — ERREUR MÉTIER : tournoi de 6h, endDate non atteinte alors que +3h l'est ====
  // Début il y a 4h, fin dans 2h : l'évènement est encore en cours, NON
  // verrouillé, bien que event_date + 3h soit déjà dépassé.
  it("ne verrouille pas un évènement dont endDate n'est pas atteinte, même si event_date + 3h est dépassé", () => {
    const eventDate = new Date(NOW - 4 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(NOW + 2 * 60 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDate, endDate, NOW)).toBe(false);
  });

  // ==== CAS 6 — ROBUSTESSE : endDate invalide => repli sur la règle des 3h, sans exception ====
  it("se replie sur la règle des 3h sans exception quand endDate est une chaîne invalide", () => {
    const eventDate = new Date(NOW - 4 * 60 * 60 * 1000).toISOString();
    expect(() => isEventLocked(eventDate, "pas-une-date", NOW)).not.toThrow();
    expect(isEventLocked(eventDate, "pas-une-date", NOW)).toBe(true);

    const eventDateRecent = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDateRecent, "pas-une-date", NOW)).toBe(false);
  });

  // ==== CAS 7 — ROBUSTESSE : endDate null => repli sur la règle des 3h ====
  it("se replie sur la règle des 3h quand endDate est explicitement null", () => {
    const eventDate = new Date(NOW - 4 * 60 * 60 * 1000).toISOString();
    expect(isEventLocked(eventDate, null, NOW)).toBe(true);
  });

  // ==== CAS 8 — ROBUSTESSE : eventDate nul => false, comportement actuel préservé ====
  it("retourne false sans exception quand eventDate est null ou undefined, même avec endDate fourni", () => {
    expect(() => isEventLocked(null, null, NOW)).not.toThrow();
    expect(isEventLocked(null, null, NOW)).toBe(false);
    expect(isEventLocked(undefined, undefined, NOW)).toBe(false);
    // Un endDate valide ne doit pas "sauver" un eventDate absent.
    const endDate = new Date(NOW - 60 * 1000).toISOString();
    expect(isEventLocked(null, endDate, NOW)).toBe(false);
  });

  // ==== CAS 9 — ROBUSTESSE : eventDate invalide => false ====
  it("retourne false sans exception quand eventDate est une chaîne invalide", () => {
    expect(() => isEventLocked("pas-une-date", null, NOW)).not.toThrow();
    expect(isEventLocked("pas-une-date", null, NOW)).toBe(false);
  });

  // ==== CAS 10 — LIMITE : endDate exactement égale à now => verrouillé ====
  // Cohérent avec la sémantique stricte existante (`time + GRACE < now`),
  // on documente explicitement la borne pour endDate : `now > endDate`
  // signifie que l'égalité stricte n'est PAS verrouillée.
  it("ne verrouille pas quand endDate est exactement égale à now (borne non verrouillée)", () => {
    const eventDate = new Date(NOW - 1 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(NOW).toISOString();
    expect(isEventLocked(eventDate, endDate, NOW)).toBe(false);
  });

  it("garde la constante EVENT_LOCK_GRACE_MS à 3h (référence utilisée par les tests)", () => {
    expect(EVENT_LOCK_GRACE_MS).toBe(3 * 60 * 60 * 1000);
  });
});

describe("getEventDurationMinutes", () => {
  // ==== CAS 1 — NOMINAL : entraînement de 1h30 ====
  it("retourne 90 pour une durée de 1h30 (pré-remplissage entraînement)", () => {
    const eventDate = "2026-08-26T10:00:00.000Z";
    const endDate = "2026-08-26T11:30:00.000Z";
    expect(getEventDurationMinutes(eventDate, endDate)).toBe(90);
  });

  // ==== CAS 2 — NOMINAL : match de 2h ====
  it("retourne 120 pour une durée de 2h (pré-remplissage match)", () => {
    const eventDate = "2026-08-26T10:00:00.000Z";
    const endDate = "2026-08-26T12:00:00.000Z";
    expect(getEventDurationMinutes(eventDate, endDate)).toBe(120);
  });

  // ==== CAS 3 — LIMITE : endDate absente => null ====
  it("retourne null quand endDate est absente (undefined)", () => {
    const eventDate = "2026-08-26T10:00:00.000Z";
    expect(getEventDurationMinutes(eventDate, undefined)).toBeNull();
  });

  // ==== CAS 4 — LIMITE : endDate null => null ====
  it("retourne null quand endDate est explicitement null", () => {
    const eventDate = "2026-08-26T10:00:00.000Z";
    expect(getEventDurationMinutes(eventDate, null)).toBeNull();
  });

  // ==== CAS 5 — ERREUR MÉTIER : endDate antérieure au début => null (incohérent) ====
  it("retourne null quand endDate est antérieure à eventDate", () => {
    const eventDate = "2026-08-26T12:00:00.000Z";
    const endDate = "2026-08-26T10:00:00.000Z";
    expect(getEventDurationMinutes(eventDate, endDate)).toBeNull();
  });

  // ==== CAS 6 — LIMITE : endDate égale à eventDate => null (durée nulle, incohérente) ====
  it("retourne null quand endDate est égale à eventDate (durée nulle)", () => {
    const eventDate = "2026-08-26T10:00:00.000Z";
    expect(getEventDurationMinutes(eventDate, eventDate)).toBeNull();
  });

  // ==== CAS 7 — ROBUSTESSE : eventDate invalide => null sans exception ====
  it("retourne null sans exception quand eventDate est invalide", () => {
    const endDate = "2026-08-26T11:30:00.000Z";
    expect(() => getEventDurationMinutes("pas-une-date", endDate)).not.toThrow();
    expect(getEventDurationMinutes("pas-une-date", endDate)).toBeNull();
  });

  // ==== CAS 8 — ROBUSTESSE : endDate invalide => null sans exception ====
  it("retourne null sans exception quand endDate est invalide", () => {
    const eventDate = "2026-08-26T10:00:00.000Z";
    expect(() => getEventDurationMinutes(eventDate, "pas-une-date")).not.toThrow();
    expect(getEventDurationMinutes(eventDate, "pas-une-date")).toBeNull();
  });

  // ==== CAS 9 — ROBUSTESSE : eventDate nulle/undefined => null ====
  it("retourne null sans exception quand eventDate est null ou undefined", () => {
    const endDate = "2026-08-26T11:30:00.000Z";
    expect(getEventDurationMinutes(null, endDate)).toBeNull();
    expect(getEventDurationMinutes(undefined, endDate)).toBeNull();
  });
});

/**
 * Tests TDD — shiftEndDate & applyDurationToStart (Phase RED)
 *
 * Bug production : "new row for relation events violates check constraint
 * events_end_date_after_event_date" (contrainte SQL :
 * supabase/migrations/081_events_end_date.sql — end_date IS NULL OR
 * end_date > event_date).
 *
 * Cause racine dans EventCoachActions.tsx :
 *   - Bug 1 (saveReport / saveEdit, portée "single") : la fin saisie ne suit
 *     pas le début quand celui-ci est déplacé => fin < début.
 *   - Bug 2 (saveEdit, portée "all", décalage nul) : la même fin ABSOLUE est
 *     appliquée à toutes les occurrences d'une série récurrente, alors que
 *     chaque occurrence a son propre début => fin < début pour les autres
 *     occurrences.
 *
 * Correctif attendu : raisonner en DURÉE (conservée), pas en fin absolue.
 *   - shiftEndDate : recalcule la fin quand le début change, en conservant
 *     la durée d'origine (previousEnd - previousStart).
 *   - applyDurationToStart : applique une durée en minutes à un début donné
 *     (utilisé pour propager la même durée sur chaque occurrence d'une
 *     série, chacune avec son propre début).
 */

describe("isLockedForRole", () => {
  // Dates ancrées sur Date.now() réel pour éviter tout décalage temporel.
  const realNow = Date.now();
  const passeDate = new Date(realNow - 4 * 60 * 60 * 1000).toISOString(); // 4h dans le passé => verrouillé
  const futurDate = new Date(realNow + 2 * 60 * 60 * 1000).toISOString(); // 2h dans le futur => non verrouillé

  // ==== P0 — un coach n'est JAMAIS verrouillé ====
  it("[P0] un coach n'est JAMAIS verrouillé, même après l'événement", () => {
    expect(isLockedForRole(passeDate, null, true)).toBe(false);
  });

  // ==== P0 — un joueur est verrouillé après l'événement ====
  it("[P0] un joueur est verrouillé après l'événement", () => {
    expect(isLockedForRole(passeDate, null, false)).toBe(true);
  });

  // ==== P0 — un joueur n'est PAS verrouillé avant l'événement ====
  it("[P0] un joueur n'est pas verrouillé avant l'événement", () => {
    expect(isLockedForRole(futurDate, null, false)).toBe(false);
  });

  // ==== P1 — isCoach undefined → verrouillé comme joueur ====
  it("[P1] isCoach undefined → verrouillé comme joueur après l'événement", () => {
    expect(isLockedForRole(passeDate, null, undefined)).toBe(true);
  });
});

describe("shiftEndDate", () => {
  // ==== CAS 1 — NOMINAL : début déplacé de 7 jours, durée de 2h conservée ====
  it("déplace la fin de 7 jours quand le début est déplacé de 7 jours (durée de 2h conservée)", () => {
    const previousStart = "2026-08-26T10:00:00.000Z";
    const previousEnd = "2026-08-26T12:00:00.000Z";
    const newStart = "2026-09-02T10:00:00.000Z";
    expect(shiftEndDate(previousStart, previousEnd, newStart)).toBe(
      "2026-09-02T12:00:00.000Z"
    );
  });

  // ==== CAS 2 — NOMINAL : début reculé dans le passé, durée conservée ====
  it("conserve la durée quand le début est reculé dans le passé", () => {
    const previousStart = "2026-08-26T10:00:00.000Z";
    const previousEnd = "2026-08-26T11:30:00.000Z";
    const newStart = "2026-08-20T09:00:00.000Z";
    expect(shiftEndDate(previousStart, previousEnd, newStart)).toBe(
      "2026-08-20T10:30:00.000Z"
    );
  });

  // ==== CAS 3 — LIMITE : previousEnd absent => null (pas de fin fabriquée) ====
  it("retourne null quand previousEnd est null (aucune fin n'existait avant)", () => {
    const previousStart = "2026-08-26T10:00:00.000Z";
    const newStart = "2026-09-02T10:00:00.000Z";
    expect(shiftEndDate(previousStart, null, newStart)).toBeNull();
  });

  // ==== CAS 4 — NOMINAL : début inchangé => fin inchangée ====
  it("retourne la même fin quand le début ne change pas", () => {
    const previousStart = "2026-08-26T10:00:00.000Z";
    const previousEnd = "2026-08-26T12:00:00.000Z";
    expect(shiftEndDate(previousStart, previousEnd, previousStart)).toBe(
      "2026-08-26T12:00:00.000Z"
    );
  });

  // ==== CAS 5 — ROBUSTESSE : entrées invalides => null, sans exception ====
  it("retourne null sans exception quand une des dates est invalide ou absente", () => {
    const previousStart = "2026-08-26T10:00:00.000Z";
    const previousEnd = "2026-08-26T12:00:00.000Z";
    expect(() =>
      shiftEndDate(previousStart, previousEnd, "pas-une-date")
    ).not.toThrow();
    expect(shiftEndDate(previousStart, previousEnd, "pas-une-date")).toBeNull();
    expect(shiftEndDate("pas-une-date", previousEnd, previousStart)).toBeNull();
    expect(shiftEndDate(previousStart, previousEnd, undefined)).toBeNull();
  });

  // ==== CAS 6 — NON-RÉGRESSION BUG 1 : la fin recalculée reste toujours
  // strictement postérieure au nouveau début. C'est l'invariant exact que
  // vérifie la contrainte SQL events_end_date_after_event_date, violé par le
  // bug de production (report d'un match d'une semaine sans déplacer la fin).
  it("[non-régression bug 1] la fin recalculée est toujours strictement postérieure au nouveau début", () => {
    const previousStart = "2026-08-26T10:00:00.000Z";
    const previousEnd = "2026-08-26T12:00:00.000Z";
    const newStart = "2026-09-02T10:00:00.000Z"; // match reporté d'une semaine

    const result = shiftEndDate(previousStart, previousEnd, newStart);

    expect(result).not.toBeNull();
    expect(new Date(result as string).getTime()).toBeGreaterThan(
      new Date(newStart).getTime()
    );
  });
});

describe("applyDurationToStart", () => {
  // ==== CAS 7 — NOMINAL : 90 minutes appliquées à un début donné ====
  it("applique une durée de 90 minutes à un début donné", () => {
    const start = "2026-08-26T10:00:00.000Z";
    expect(applyDurationToStart(start, 90)).toBe("2026-08-26T11:30:00.000Z");
  });

  // ==== CAS 8 — LIMITE : durée null ou undefined => null ====
  it("retourne null quand la durée est null ou undefined", () => {
    const start = "2026-08-26T10:00:00.000Z";
    expect(applyDurationToStart(start, null)).toBeNull();
    expect(applyDurationToStart(start, undefined)).toBeNull();
  });

  // ==== CAS 9 — ERREUR MÉTIER : durée nulle ou négative => null ====
  // Une fin ne peut jamais précéder ou égaler le début (contrainte SQL
  // stricte : end_date > event_date).
  it("retourne null quand la durée est nulle (0) ou négative", () => {
    const start = "2026-08-26T10:00:00.000Z";
    expect(applyDurationToStart(start, 0)).toBeNull();
    expect(applyDurationToStart(start, -30)).toBeNull();
  });

  // ==== CAS 10 — ROBUSTESSE : début invalide => null, sans exception ====
  it("retourne null sans exception quand le début est invalide", () => {
    expect(() => applyDurationToStart("pas-une-date", 90)).not.toThrow();
    expect(applyDurationToStart("pas-une-date", 90)).toBeNull();
    expect(applyDurationToStart(null, 90)).toBeNull();
    expect(applyDurationToStart(undefined, 90)).toBeNull();
  });

  // ==== CAS 11 — NON-RÉGRESSION BUG 2 : trois occurrences d'une série à des
  // dates différentes, même durée appliquée => trois fins DISTINCTES, chacune
  // strictement postérieure à SON PROPRE début. C'est exactement ce que le
  // code fautif ne fait pas (il écrivait la même fin absolue sur toutes les
  // occurrences via .eq("recurrence_group_id", ...)).
  it("[non-régression bug 2] applique la même durée à 3 occurrences d'une série avec des fins distinctes, chacune postérieure à son propre début", () => {
    const occurrence1Start = "2026-08-26T10:00:00.000Z";
    const occurrence2Start = "2026-09-02T10:00:00.000Z";
    const occurrence3Start = "2026-09-09T10:00:00.000Z";
    const durationMinutes = 120;

    const end1 = applyDurationToStart(occurrence1Start, durationMinutes);
    const end2 = applyDurationToStart(occurrence2Start, durationMinutes);
    const end3 = applyDurationToStart(occurrence3Start, durationMinutes);

    // Fins distinctes (pas la même fin absolue imposée à tout le groupe).
    expect(end1).not.toBe(end2);
    expect(end2).not.toBe(end3);
    expect(end1).not.toBe(end3);

    // Chaque fin est strictement postérieure à SON propre début.
    expect(new Date(end1 as string).getTime()).toBeGreaterThan(
      new Date(occurrence1Start).getTime()
    );
    expect(new Date(end2 as string).getTime()).toBeGreaterThan(
      new Date(occurrence2Start).getTime()
    );
    expect(new Date(end3 as string).getTime()).toBeGreaterThan(
      new Date(occurrence3Start).getTime()
    );
  });
});
