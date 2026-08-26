/**
 * Tests TDD — groupRemindersByEvent / countPendingPlayers (Phase RED)
 *
 * Feature cible : bouton « Relancer tous » côté coach, qui relance en une
 * fois tous les joueurs n'ayant pas répondu à leur convocation, à deux
 * emplacements :
 *   - la carte « Convocations en attente » du tableau de bord
 *     (plusieurs évènements) ;
 *   - les pages d'évènement `matches/[id]` / `trainings/[id]` (un seul
 *     évènement).
 *
 * Logique pure partagée par les deux emplacements (aucun accès DB ici) :
 * regrouper par évènement les destinataires à relancer, parents liés
 * inclus, comme le fait déjà `sendAttendanceReminders`
 * (src/app/api/notifications/cron/route.ts) et `parent_student`.
 *
 * Règles métier :
 *   - Retenus : `attendances.status` = 'pending' OU null (pas de réponse).
 *     Exclus : 'present', 'absent', 'late', 'excused' (a répondu).
 *   - Les parents liés (`parent_student.parent_id` pour student_id = joueur
 *     retenu) sont ajoutés aux destinataires du même évènement, sans doublon
 *     même si le parent est lié à plusieurs joueurs sans réponse.
 *   - Un évènement verrouillé (`isEventLocked`, cf. src/lib/event-lock.ts)
 *     est intégralement ignoré : on ne relance pas une convocation qui ne
 *     peut plus recevoir de réponse.
 *   - Un évènement sans plus personne en attente n'apparaît pas dans le
 *     résultat (pas d'entrée avec userIds vide).
 *   - Les attendances d'un évènement ne doivent pas fuiter vers un autre.
 *   - Une attendance référençant un event_id inconnu est ignorée sans
 *     exception.
 *
 * countPendingPlayers : nombre total de joueurs (hors parents) encore en
 * attente, tous évènements confondus. DÉCISION FIGÉE : un même joueur
 * convoqué à deux évènements distincts et toujours en attente sur les deux
 * compte deux fois (une occurrence par évènement, pas de dédoublonnage par
 * userId global) — le libellé du bouton reflète le nombre de convocations
 * en attente à relancer, pas le nombre de personnes physiques distinctes.
 */

import { describe, it, expect } from "vitest";

import {
  groupRemindersByEvent,
  countPendingPlayers,
  type ReminderEvent,
  type ReminderAttendance,
  type ReminderParentLink,
} from "@/lib/convocation-reminders";

const NOW = new Date("2026-08-26T12:00:00.000Z").getTime();

function makeEvent(overrides: Partial<ReminderEvent> = {}): ReminderEvent {
  return {
    id: "event-1",
    title: "Match vs Rivaux",
    type: "match",
    event_date: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(), // dans 2h par défaut
    end_date: null,
    ...overrides,
  };
}

function makeAttendance(
  overrides: Partial<ReminderAttendance> = {}
): ReminderAttendance {
  return {
    event_id: "event-1",
    user_id: "player-1",
    status: "pending",
    ...overrides,
  };
}

function makeParentLink(
  overrides: Partial<ReminderParentLink> = {}
): ReminderParentLink {
  return {
    parent_id: "parent-1",
    student_id: "player-1",
    ...overrides,
  };
}

describe("groupRemindersByEvent", () => {
  // ==== CAS 1 — NOMINAL : un joueur pending est retenu ====
  it("retient un joueur au statut pending", () => {
    const events = [makeEvent()];
    const attendances = [makeAttendance({ status: "pending" })];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([
      { event: events[0], userIds: ["player-1"] },
    ]);
  });

  // ==== CAS 2 — NOMINAL : un joueur sans statut (null) est retenu ====
  // "pas encore répondu" peut se traduire par une ligne attendance absente
  // de status explicite plutôt que 'pending' selon le flux d'insertion.
  it("retient un joueur au statut null (absence de réponse)", () => {
    const events = [makeEvent()];
    const attendances = [makeAttendance({ status: null })];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([
      { event: events[0], userIds: ["player-1"] },
    ]);
  });

  // ==== CAS 3 — ERREUR MÉTIER : les statuts "a répondu" sont exclus ====
  // present/absent/late/excused signifient que la personne a répondu :
  // ne pas la relancer serait redondant et pourrait irriter l'utilisateur.
  it("exclut les joueurs ayant déjà répondu (present, absent, late, excused)", () => {
    const events = [makeEvent()];
    const attendances = [
      makeAttendance({ user_id: "player-present", status: "present" }),
      makeAttendance({ user_id: "player-absent", status: "absent" }),
      makeAttendance({ user_id: "player-late", status: "late" }),
      makeAttendance({ user_id: "player-excused", status: "excused" }),
    ];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  // ==== CAS 4 — NOMINAL : les parents liés sont ajoutés au même évènement ====
  it("ajoute les parents liés d'un joueur retenu, dans le même évènement", () => {
    const events = [makeEvent()];
    const attendances = [makeAttendance({ user_id: "player-1", status: "pending" })];
    const parentLinks = [makeParentLink({ parent_id: "parent-1", student_id: "player-1" })];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks,
      now: NOW,
    });
    expect(result).toHaveLength(1);
    expect(new Set(result[0].userIds)).toEqual(new Set(["player-1", "parent-1"]));
    expect(result[0].userIds).toHaveLength(2);
  });

  // ==== CAS 5 — ANTI-DOUBLON : un parent lié à deux joueurs sans réponse
  // n'apparaît qu'une fois ====
  // Sans cette garantie, le parent recevrait deux notifications identiques
  // pour le même évènement (un fratrie souvent inscrite dans la même équipe).
  it("ne duplique pas un parent lié à deux joueurs sans réponse du même évènement", () => {
    const events = [makeEvent()];
    const attendances = [
      makeAttendance({ user_id: "player-1", status: "pending" }),
      makeAttendance({ user_id: "player-2", status: "pending" }),
    ];
    const parentLinks = [
      makeParentLink({ parent_id: "parent-shared", student_id: "player-1" }),
      makeParentLink({ parent_id: "parent-shared", student_id: "player-2" }),
    ];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks,
      now: NOW,
    });
    expect(result).toHaveLength(1);
    const parentOccurrences = result[0].userIds.filter((id) => id === "parent-shared");
    expect(parentOccurrences).toHaveLength(1);
    expect(new Set(result[0].userIds)).toEqual(
      new Set(["player-1", "player-2", "parent-shared"])
    );
  });

  // ==== CAS 6 — VERROUILLAGE : un évènement passé sans end_date (règle des
  // 3h) est intégralement ignoré ====
  it("ignore un évènement verrouillé (passé de 4h, sans end_date)", () => {
    const events = [
      makeEvent({ event_date: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(), end_date: null }),
    ];
    const attendances = [makeAttendance({ status: "pending" })];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  // ==== CAS 7 — VERROUILLAGE : un évènement dont l'end_date est dépassée
  // est ignoré, même si event_date + 3h ne l'est pas encore ====
  it("ignore un évènement dont end_date est dépassée (tournoi long)", () => {
    const events = [
      makeEvent({
        event_date: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(),
        end_date: new Date(NOW - 10 * 60 * 1000).toISOString(),
      }),
    ];
    const attendances = [makeAttendance({ status: "pending" })];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  // ==== CAS 8 — LIMITE : un évènement sans personne en attente n'apparaît
  // pas dans le résultat ====
  // Éviter d'exposer une entrée vide côté UI (bouton "relancer 0 joueur").
  it("n'inclut pas un évènement dont plus personne n'est en attente", () => {
    const events = [makeEvent()];
    const attendances = [makeAttendance({ status: "present" })];
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  // ==== CAS 9 — MULTI-ÉVÈNEMENT : chaque évènement a ses propres
  // destinataires, sans fuite entre évènements ====
  it("regroupe correctement les destinataires de plusieurs évènements sans fuite croisée", () => {
    const eventA = makeEvent({ id: "event-A", title: "Match A" });
    const eventB = makeEvent({ id: "event-B", title: "Entraînement B", type: "training" });
    const attendances = [
      makeAttendance({ event_id: "event-A", user_id: "player-a1", status: "pending" }),
      makeAttendance({ event_id: "event-A", user_id: "player-a2", status: "present" }),
      makeAttendance({ event_id: "event-B", user_id: "player-b1", status: null }),
    ];
    const result = groupRemindersByEvent({
      events: [eventA, eventB],
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toHaveLength(2);
    const byId = new Map(result.map((r) => [r.event.id, r.userIds]));
    expect(byId.get("event-A")).toEqual(["player-a1"]);
    expect(byId.get("event-B")).toEqual(["player-b1"]);
  });

  // ==== CAS 10 — LIMITE : entrées vides (aucun évènement, aucune
  // attendance) donnent un tableau vide ====
  it("retourne un tableau vide quand il n'y a ni évènement ni attendance", () => {
    const result = groupRemindersByEvent({
      events: [],
      attendances: [],
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([]);
  });

  // ==== CAS 11 — ROBUSTESSE : une attendance référençant un event_id
  // inconnu est ignorée sans exception ====
  it("ignore silencieusement une attendance dont l'event_id est inconnu", () => {
    const events = [makeEvent({ id: "event-1" })];
    const attendances = [
      makeAttendance({ event_id: "event-1", user_id: "player-1", status: "pending" }),
      makeAttendance({ event_id: "event-inconnu", user_id: "player-fantome", status: "pending" }),
    ];
    expect(() =>
      groupRemindersByEvent({ events, attendances, parentLinks: [], now: NOW })
    ).not.toThrow();
    const result = groupRemindersByEvent({
      events,
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(result).toEqual([{ event: events[0], userIds: ["player-1"] }]);
  });
});

describe("countPendingPlayers", () => {
  // ==== CAS 12 — NOMINAL : compte les joueurs (hors parents) en attente ====
  it("compte les joueurs en attente sans les parents", () => {
    const events = [makeEvent()];
    const attendances = [
      makeAttendance({ user_id: "player-1", status: "pending" }),
      makeAttendance({ user_id: "player-2", status: "pending" }),
    ];
    const parentLinks = [makeParentLink({ parent_id: "parent-1", student_id: "player-1" })];
    const targets = groupRemindersByEvent({
      events,
      attendances,
      parentLinks,
      now: NOW,
    });
    expect(countPendingPlayers(targets, attendances)).toBe(2);
  });

  // ==== CAS 13 — DÉCISION FIGÉE : un joueur convoqué à deux évènements
  // distincts et en attente sur les deux compte deux fois (pas de
  // dédoublonnage global par userId) ====
  it("compte deux fois un même joueur en attente sur deux évènements distincts", () => {
    const eventA = makeEvent({ id: "event-A" });
    const eventB = makeEvent({ id: "event-B" });
    const attendances = [
      makeAttendance({ event_id: "event-A", user_id: "player-1", status: "pending" }),
      makeAttendance({ event_id: "event-B", user_id: "player-1", status: "pending" }),
    ];
    const targets = groupRemindersByEvent({
      events: [eventA, eventB],
      attendances,
      parentLinks: [],
      now: NOW,
    });
    expect(countPendingPlayers(targets, attendances)).toBe(2);
  });

  // ==== CAS 14 — LIMITE : aucun target => 0 ====
  it("retourne 0 quand il n'y a aucun destinataire à relancer", () => {
    expect(countPendingPlayers([], [])).toBe(0);
  });
});
