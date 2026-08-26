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

import { selectLastSession } from "@/lib/sessionSelection";
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
    end_date: string | null;
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

  // ==== CAS 15 — ERREUR MÉTIER : end_date dépassée depuis 10 min, event_date + 3h non atteint => proposée ====
  // Séance longue (ex: stage) : le début seul ne suffit plus à juger la fin
  // réelle. end_date fait foi dès qu'elle est renseignée.
  it("propose une séance dont end_date est dépassée depuis 10 min, même si event_date + 3h n'est pas atteint", () => {
    const result = selectLastSession({
      events: [
        makeEvent({
          id: "e-long",
          event_date: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(), // commencée il y a 1h
          end_date: new Date(NOW - 10 * 60 * 1000).toISOString(), // finie il y a 10 min
        }),
      ],
      attendances: [makeAttendance({ event_id: "e-long" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e-long");
  });

  // ==== CAS 16 — ERREUR MÉTIER : end_date dans le futur, event_date + 3h dépassé => non proposée ====
  // Tournoi de 6h en cours : la règle historique des 3h la considérerait à
  // tort comme terminée, alors qu'elle ne l'est pas.
  it("ne propose pas une séance dont end_date est dans le futur, même si event_date + 3h est dépassé", () => {
    const result = selectLastSession({
      events: [
        makeEvent({
          id: "e-tournament",
          event_date: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(), // commencée il y a 4h
          end_date: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(), // finit dans 2h
        }),
      ],
      attendances: [makeAttendance({ event_id: "e-tournament" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 17 — NON-RÉGRESSION : séance sans end_date => comportement strictement inchangé ====
  it("conserve le comportement historique (règle des 3h) quand end_date est absente", () => {
    const result = selectLastSession({
      events: [makeEvent({ id: "e1" })], // pas de end_date, hier par défaut
      attendances: [makeAttendance({ event_id: "e1" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });
});

/**
 * Tests TDD — selectNextSession (Phase RED)
 *
 * Feature cible : sur l'accueil joueur, proposer le check-in de forme
 * (« Comment te sens-tu aujourd'hui ? ») pour la PROCHAINE séance
 * d'entraînement à venir, dans une fenêtre de 12h avant celle-ci.
 * Contrairement au RPE (après séance), le check-in se remplit AVANT.
 *
 * Règles métier couvertes :
 *   - Seuls les events `type: "training"` sont éligibles (un match plus
 *     proche est ignoré).
 *   - Seules les séances à venir comptent : `event_date > now`.
 *   - Fenêtre de 12h : la séance n'est proposée que si elle a lieu dans les
 *     12h (CHECK_IN_WINDOW_MS). Dans 3h => proposée ; dans 18h => null.
 *   - Parmi les séances éligibles, on retient la PLUS PROCHE dans le temps.
 *   - Une séance annulée (`status: "cancelled"`) est ignorée.
 *   - Présence : contrairement à selectLastSession, le statut "pending" est
 *     ÉLIGIBLE ici (avant la séance, le joueur peut ne pas avoir encore
 *     répondu à la convocation tout en devant déclarer sa forme). Seuls
 *     "absent" et "excused" excluent la séance.
 *   - Absence de ligne attendances pour ce joueur => permissif, proposée.
 *   - Les lignes attendances d'un autre joueur n'ont aucune influence.
 *   - Liste d'events vide => null.
 */

import {
  selectNextSession,
  CHECK_IN_WINDOW_MS,
  isCheckInOpen,
} from "@/lib/sessionSelection";

describe("selectNextSession", () => {
  // ==== CAS 1 — NOMINAL : une séance training dans 3h et pending => proposée ====
  it("retourne l'id de la prochaine séance training dans la fenêtre de 12h", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 3 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [makeAttendance({ event_id: "e1", status: "pending" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 2 — ERREUR MÉTIER : un match plus proche est ignoré au profit du training ====
  it("ignore un match même plus proche et retient l'entraînement", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "training-in-6h",
          event_date: new Date(NOW + 6 * 60 * 60 * 1000).toISOString(),
        }),
        makeEvent({
          id: "match-in-2h",
          type: "match",
          event_date: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [makeAttendance({ event_id: "training-in-6h", status: "present" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("training-in-6h");
  });

  // ==== CAS 3 — LIMITE : séance dans 3h (dans la fenêtre de 12h) => proposée ====
  it("propose une séance ayant lieu dans 3h (dans la fenêtre de 12h)", () => {
    expect(CHECK_IN_WINDOW_MS).toBe(12 * 60 * 60 * 1000);
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 3 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 4 — LIMITE : séance dans 18h (hors fenêtre de 12h) => null ====
  // 18h est volontairement choisi juste au-delà de la fenêtre : la borne est
  // ainsi réellement testée, ce qu'un cas à 48h ne ferait pas.
  it("ne propose pas une séance ayant lieu dans 18h (hors fenêtre de 12h)", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 18 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 5 — NOMINAL : plusieurs séances éligibles => on retient la plus proche ====
  it("retient la séance à venir la plus proche parmi plusieurs éligibles", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e-far",
          event_date: new Date(NOW + 20 * 60 * 60 * 1000).toISOString(),
        }),
        makeEvent({
          id: "e-close",
          event_date: new Date(NOW + 4 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [
        makeAttendance({ event_id: "e-far", status: "present" }),
        makeAttendance({ event_id: "e-close", status: "present" }),
      ],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e-close");
  });

  // ==== CAS 6 — ERREUR MÉTIER : séance annulée ignorée ====
  it("ignore une séance annulée (status cancelled)", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e-cancelled",
          status: "cancelled",
          event_date: new Date(NOW + 2 * 60 * 60 * 1000).toISOString(),
        }),
        makeEvent({
          id: "e-valid",
          event_date: new Date(NOW + 10 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [
        makeAttendance({ event_id: "e-cancelled", status: "present" }),
        makeAttendance({ event_id: "e-valid", status: "present" }),
      ],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e-valid");
  });

  // ==== CAS 7 — PIÈGE ANTI-FACTORISATION : "pending" est ÉLIGIBLE ici, contrairement
  // à selectLastSession où "pending" retourne null. Avant la séance, le joueur peut
  // ne pas avoir encore répondu à sa convocation tout en devant pouvoir déclarer son
  // état de forme : les deux fonctions NE sont PAS factorisables sur cette règle. ====
  it("propose la séance quand la présence est encore en attente (pending) — inverse de selectLastSession", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 5 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [makeAttendance({ event_id: "e1", status: "pending" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 8 — TRANSITION MÉTIER : présence "absent" => null ====
  it("retourne null quand le joueur est marqué absent sur la séance", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 5 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [makeAttendance({ event_id: "e1", status: "absent" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 9 — TRANSITION MÉTIER : présence "excused" => null ====
  it("retourne null quand le joueur est excusé sur la séance", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 5 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [makeAttendance({ event_id: "e1", status: "excused" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 10 — LIMITE : présence "late" => proposée ====
  it("propose la séance quand le joueur est marqué en retard (late)", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 5 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [makeAttendance({ event_id: "e1", status: "late" })],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 11 — LIMITE : aucune ligne attendances pour ce joueur => permissif, proposée ====
  it("propose la séance quand aucune ligne attendances n'existe pour ce joueur", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 5 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 12 — ROBUSTESSE : la ligne attendances d'un AUTRE joueur n'influence pas le résultat ====
  it("ignore les lignes attendances appartenant à un autre joueur", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e1",
          event_date: new Date(NOW + 5 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [
        makeAttendance({ event_id: "e1", user_id: "autre-joueur", status: "absent" }),
      ],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBe("e1");
  });

  // ==== CAS 13 — LIMITE : liste d'events vide => null ====
  it("retourne null quand la liste d'events est vide", () => {
    const result = selectNextSession({
      events: [],
      attendances: [],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  // ==== CAS 14 — LIMITE : séance déjà passée (event_date <= now) => ignorée ====
  it("ignore une séance déjà passée (event_date <= now)", () => {
    const result = selectNextSession({
      events: [
        makeEvent({
          id: "e-past",
          event_date: new Date(NOW - 60 * 60 * 1000).toISOString(),
        }),
      ],
      attendances: [],
      playerId: PLAYER_ID,
      now: NOW,
    });
    expect(result).toBeNull();
  });
});

/**
 * Tests TDD — isCheckInOpen (Phase RED)
 *
 * Feature cible : fonction pure extraite pour réutiliser la même règle de
 * fenêtre de check-in (12h avant la séance) à la fois sur l'accueil joueur
 * (via selectNextSession) et sur la fiche d'entraînement
 * (SessionFormCheckIn.tsx), qui aujourd'hui n'applique aucune limite.
 *
 * Règles métier couvertes :
 *   - Ouvert dans les CHECK_IN_WINDOW_MS précédant la séance (12h).
 *   - Fermé une fois la séance commencée (date passée).
 *   - Borne exactement à CHECK_IN_WINDOW_MS => inclusive (cohérent avec le
 *     `<=` utilisé dans selectNextSession).
 *   - Entrée absente ou invalide => false, sans exception (cf. isEventLocked
 *     dans event-lock.ts).
 */

describe("isCheckInOpen", () => {
  // ==== CAS 1 — NOMINAL : séance dans 3h => ouvert ====
  it("retourne true quand la séance a lieu dans 3h", () => {
    const eventDate = new Date(NOW + 3 * 60 * 60 * 1000).toISOString();
    expect(isCheckInOpen(eventDate, NOW)).toBe(true);
  });

  // ==== CAS 2 — LIMITE : séance dans 18h (au-delà de la fenêtre de 12h) => fermé ====
  it("retourne false quand la séance a lieu dans 18h (hors fenêtre de 12h)", () => {
    const eventDate = new Date(NOW + 18 * 60 * 60 * 1000).toISOString();
    expect(isCheckInOpen(eventDate, NOW)).toBe(false);
  });

  // ==== CAS 3 — TRANSITION MÉTIER : séance déjà commencée (date passée) => fermé ====
  // Le check-in porte sur l'avant-séance : une fois la séance commencée, il
  // n'a plus de sens de déclarer sa forme "avant" de jouer.
  it("retourne false quand la séance est déjà commencée (date passée)", () => {
    const eventDate = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(isCheckInOpen(eventDate, NOW)).toBe(false);
  });

  // ==== CAS 4 — LIMITE : eventDate exactement à now + CHECK_IN_WINDOW_MS => borne inclusive ====
  // Cohérent avec selectNextSession qui utilise `time - now <= CHECK_IN_WINDOW_MS`.
  it("retourne true quand la séance est exactement à la borne des 12h (inclusive)", () => {
    const eventDate = new Date(NOW + CHECK_IN_WINDOW_MS).toISOString();
    expect(isCheckInOpen(eventDate, NOW)).toBe(true);
  });

  // ==== CAS 5 — ROBUSTESSE : eventDate null/undefined => false sans exception ====
  it("retourne false sans lever d'exception quand eventDate est null ou undefined", () => {
    expect(() => isCheckInOpen(null, NOW)).not.toThrow();
    expect(isCheckInOpen(null, NOW)).toBe(false);
    expect(() => isCheckInOpen(undefined, NOW)).not.toThrow();
    expect(isCheckInOpen(undefined, NOW)).toBe(false);
  });

  // ==== CAS 6 — ROBUSTESSE : chaîne de date invalide => false sans exception ====
  it("retourne false sans lever d'exception quand eventDate est une chaîne invalide", () => {
    expect(() => isCheckInOpen("pas-une-date", NOW)).not.toThrow();
    expect(isCheckInOpen("pas-une-date", NOW)).toBe(false);
  });

  // ==== CAS 7 — CHOIX PRODUIT FIGÉ : isCheckInOpen reste basé sur event_date, PAS end_date ====
  // Le check-in porte sur l'AVANT-séance : contrairement à selectLastSession
  // (qui bascule sur end_date quand elle existe pour juger la FIN réelle),
  // isCheckInOpen ne doit jamais tenir compte d'une éventuelle end_date. On
  // fige explicitement ce choix pour ne pas le "corriger" par erreur plus
  // tard en pensant à un oubli de factorisation avec isEventLocked.
  it("ignore toute notion de end_date : reste basé uniquement sur event_date (avant-séance)", () => {
    // Signature de isCheckInOpen : (eventDate, now) — pas de paramètre end_date,
    // ce test fige ce choix de conception au niveau du comportement observable.
    const eventDate = new Date(NOW + 3 * 60 * 60 * 1000).toISOString();
    expect(isCheckInOpen(eventDate, NOW)).toBe(true);
  });
});
