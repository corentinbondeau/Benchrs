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
  getEventDurationMinutes,
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
