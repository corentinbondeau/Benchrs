/**
 * Tests TDD — selectLastSession (Phase RED)
 *
 * Feature cible : sur l'accueil joueur, proposer directement le RPE et
 * l'analyse de la DERNIÈRE séance d'entraînement passée du joueur, sans
 * qu'il ait besoin de naviguer jusqu'à la fiche de l'événement.
 *
 * Règles métier couvertes :
 *   - Seuls les events `type: "training"` sont éligibles (un match, même
 *     plus récent, est ignoré).
 *   - Seules les séances passées comptent : même règle que le reste du code
 *     (`event_date + EVENT_LOCK_GRACE_MS < now`, cf. src/lib/event-lock.ts).
 *     Le RPE n'est disponible qu'à la fin de l'entraînement.
 *   - Parmi les séances éligibles, on retient la plus récente.
 *   - Une séance annulée (`status: "cancelled"`) est ignorée.
 *   - Présence : une ligne `attendances` pour ce joueur ne rend la séance
 *     proposable que si son statut est "present" ou "late". Sinon (absent,
 *     excused, pending) => null, rien à évaluer.
 *   - Absence de ligne attendances pour ce joueur => comportement permissif,
 *     la séance est quand même proposée (les convocations ne sont créées
 *     qu'à l'envoi).
 *   - Les lignes attendances d'un autre joueur n'ont aucune influence.
 *   - Liste d'events vide => null.
 *   - Cas figé : si la séance la plus récente est écartée par la présence,
 *     on ne "retombe" PAS sur la précédente — on ne montre que LA dernière
 *     séance (choix produit assumé).
 */

import { describe, it, expect } from "vitest";

// Module non-existant : les tests doivent échouer ici (RED)
import { selectLastSession } from "@/lib/lastSession";
import { EVENT_LOCK_GRACE_MS } from "@/lib/event-lock";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-08-26T12:00:00.000Z").getTime();
const PLAYER_ID = "player-1";

function makeEvent(
  overrides: Partial<{
    id: string;
    type: string;
    event_date: string;
    status: string | null;
  }> = {}
) {
  return {
    id: "event-1",
    type: "training",
    event_date: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(), // hier, passé
    status: "completed",
    ...overrides,
  };
}

function makeAttendance(
  overrides: Partial<{ event_id: string; user_id: string; status: string | null }> = {}
) {
  return {
    event_id: "event-1",
    user_id: PLAYER_ID,
    status: "present",
    ...overrides,
  };
}

describe("selectLastSession", () => {
  // ==== CAS 1 — NOMINAL : une séance training passée et présente => proposée ====
  it("retourne l'id de la séance training passée quand le joueur est présent", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })],
      attendances: [makeAttendance({ event_id: "e1" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 2 — ERREUR MÉTIER : un match plus récent est ignoré au profit du training ====
  it("ignore un match même plus récent et retient l'entraînement", () => {
    const result = selectLastSession({
      events: [
        makeEvent({
          id: "training-old",
          event_date: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
        }),
        makeEvent({
          id: "match-recent",
          type: "match",
          event_date: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [makeAttendance({ event_id: "training-old" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("training-old");
  });

  // ==== CAS 3 — LIMITE : séance terminée il y a 1h (dans la grâce de 3h) => pas encore proposée ====
  it("ne propose pas une séance terminée il y a moins de 3h (grâce EVENT_LOCK_GRACE_MS)", () => {
    expect(EVENT_LOCK_GRACE_MS).toBe(3 * 60 * 60 * 1000);
    const result = selectLastSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(), // finie il y a 1h
        }),
      ],
      attendances: [makeAttendance({ event_id: "e1" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 4 — LIMITE : séance d'hier (bien au-delà de la grâce) => proposée ====
  it("propose une séance d'hier, largement au-delà de la grâce de 3h", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })], // hier par défaut
      attendances: [makeAttendance({ event_id: "e1" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 5 — NOMINAL : plusieurs séances éligibles => on retient la plus récente ====
  it("retient la séance passée la plus récente parmi plusieurs éligibles", () => {
    const result = selectLastSession({
      events: [
        makeEvent({
          id: "e-old",
          event_date: new Date(NOW - 72 * 60 * 60 * 1000).toISOString(),
        }),
        makeEvent({
          id: "e-recent",
          event_date: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [
        makeAttendance({ event_id: "e-old" }),
        makeAttendance({ event_id: "e-recent" }),
      ],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e-recent");
  });

  // ==== CAS 6 — ERREUR MÉTIER : séance annulée ignorée ====
  it("ignore une séance annulée (status cancelled)", () => {
    const result = selectLastSession({
      events: [
        makeEvent({
          id: "e-cancelled",
          status: "cancelled",
          event_date: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
        }),
        makeEvent({
          id: "e-valid",
          event_date: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [
        makeAttendance({ event_id: "e-cancelled" }),
        makeAttendance({ event_id: "e-valid" }),
      ],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e-valid");
  });

  // ==== CAS 7 — TRANSITION MÉTIER : présence "absent" => rien à évaluer, null ====
  it("retourne null quand le joueur est marqué absent sur la séance", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })],
      attendances: [makeAttendance({ event_id: "e1", status: "absent" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 8 — TRANSITION MÉTIER : présence "excused" => null ====
  it("retourne null quand le joueur est excusé sur la séance", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })],
      attendances: [makeAttendance({ event_id: "e1", status: "excused" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 9 — TRANSITION MÉTIER : présence "pending" => null ====
  it("retourne null quand la présence du joueur est encore en attente (pending)", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })],
      attendances: [makeAttendance({ event_id: "e1", status: "pending" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 10 — LIMITE : présence "late" => proposée comme "present" ====
  it("propose la séance quand le joueur est marqué en retard (late)", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })],
      attendances: [makeAttendance({ event_id: "e1", status: "late" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 11 — LIMITE : aucune ligne attendances pour ce joueur => permissif, proposée ====
  it("propose la séance quand aucune ligne attendances n'existe pour ce joueur", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })],
      attendances: [],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 12 — ROBUSTESSE : la ligne attendances d'un AUTRE joueur n'influence pas le résultat ====
  it("ignore les lignes attendances appartenant à un autre joueur", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })],
      attendances: [
        makeAttendance({ event_id: "e1", user_id: "autre-joueur", status: "absent" }),
      ],
      playerId: PLAYER_ID,
      now: NOW,
    });
    // Pas de ligne pour PLAYER_ID => comportement permissif, séance proposée
    expect(result).toBe("e1");
  });

  // ==== CAS 13 — LIMITE : liste d'events vide => null ====
  it("retourne null quand la liste d'events est vide", () => {
    const result = selectLastSession({
      events: [],
      attendances: [],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 14 — CHOIX PRODUIT FIGÉ : pas de repli sur la séance précédente ====
  // Si la dernière séance est écartée à cause de la présence du joueur
  // (ex: absent), on NE propose PAS la séance précédente même si elle serait
  // éligible et que le joueur y était présent. Le produit veut montrer
  // UNIQUEMENT la dernière séance, jamais un "rattrapage" plus ancien.
  it("ne retombe pas sur une séance antérieure quand la dernière est écartée par la présence", () => {
    const result = selectLastSession({
      events: [
        makeEvent({
          id: "e-recent-absent",
          event_date: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
        }),
        makeEvent({
          id: "e-older-present",
          event_date: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [
        makeAttendance({ event_id: "e-recent-absent", status: "absent" }),
        makeAttendance({ event_id: "e-older-present", status: "present" }),
      ],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });
});
