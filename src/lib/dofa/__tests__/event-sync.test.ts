/**
 * Tests — planEventSync() (src/lib/dofa/event-sync.ts) — LOT 9
 *
 * ⚠️ Zone de régression la plus risquée du chantier DOFA : touche `events`,
 * donc potentiellement les convocations (`attendances`) et le verrouillage
 * des événements passés (`src/lib/event-lock.ts`, migration
 * `080_lock_past_events.sql`).
 *
 * `planEventSync` est une fonction PURE : elle ne fait aucune I/O, ne
 * touche pas Supabase, ne mute rien. Elle se contente de DÉCIDER des
 * actions à partir de son entrée ; l'exécuteur (route d'ingestion, lot 7)
 * se contentera d'appliquer un plan déjà validé. Si un test ci-dessous a
 * besoin d'un mock, c'est que le contrat est mauvais — à faire remonter
 * plutôt que d'introduire un mock.
 *
 * === Deux corrections au plan initial du TODO (tranchées avant écriture) ===
 *
 * A4 — détection d'une saisie manuelle du coach :
 *   Le plan proposait de comparer `events.updated_at` à `last_imported_at`.
 *   Vérifié inexploitable : aucun trigger ne maintient `events.updated_at`,
 *   et l'application ne l'écrit jamais (matches/[id]/page.tsx,
 *   feuille/page.tsx, LiveMatchTracker.tsx). Méthode retenue : comparer la
 *   valeur ACTUELLE de l'événement (`eventDate`/`location`) à la DERNIÈRE
 *   VALEUR ÉCRITE PAR L'IMPORT PRÉCÉDENT (`lastImportedKickoff`/
 *   `lastImportedLocation`, portées par `championship_standings`). Un écart
 *   entre les deux signifie que le coach a modifié l'événement à la main
 *   depuis le dernier import → `conflict`. Fiable par construction, sans
 *   trigger ni migration sur `events`.
 *
 * A5 — convocations : le plan proposait de les conserver lors d'un décalage
 *   de date. Tranché à l'inverse par l'utilisateur : quand le district
 *   décale un match déjà convoqué, les réponses de présence existantes sont
 *   invalidées et les joueurs sollicités à nouveau. D'où une action
 *   distincte et explicite `reschedule-reset-attendances`, pour que
 *   l'exécuteur et l'UI sachent qu'il y aura des notifications aux joueurs.
 *   Un décalage SANS convocation reste un simple `update` : pas de bruit
 *   inutile.
 *
 * === Contrat proposé (à valider par @dev) ===
 *
 *   planEventSync(
 *     matches: DofaMatch[],
 *     existingEvents: ExistingEventRecord[],
 *     now: number,
 *     coachTeam: TeamIdentity,
 *   ): EventSyncAction[]
 *
 *   interface ExistingEventRecord {
 *     dofaMaNo: number;            // clé d'idempotence, miroir championship_standings.dofa_ma_no
 *     eventId: string;
 *     eventDate: string | null;    // valeur ACTUELLE en base (table events)
 *     endDate: string | null;      // pour isEventLocked
 *     location: string | null;     // valeur ACTUELLE en base
 *     hasAttendances: boolean;
 *     lastImportedKickoff: string | null;   // dernière valeur ÉCRITE par l'import précédent
 *     lastImportedLocation: string | null;  // idem, pour le lieu
 *   }
 *
 *   type EventSyncAction =
 *     | { action: "create"; maNo: number; event: { type: "match"; event_date: string; opponent: string; location: string | null } }
 *     | { action: "update"; maNo: number; eventId: string; changes: { event_date?: string; location?: string | null } }
 *     | { action: "noop"; maNo: number; eventId: string }
 *     | { action: "conflict"; maNo: number; eventId: string; reason: string }
 *     | { action: "skip-locked"; maNo: number; eventId: string }
 *     | { action: "postpone"; maNo: number; eventId: string | null }
 *     | { action: "reschedule-reset-attendances"; maNo: number; eventId: string; changes: { event_date: string } };
 *
 * Un match dont le `dofaMaNo` n'a AUCUN `ExistingEventRecord` correspondant
 * produit `create`. Un match dont le `dofaMaNo` a un `ExistingEventRecord`
 * correspondant, mais qui n'apparaît plus dans `matches` (retiré du flux
 * DOFA), NE PRODUIT AUCUNE ACTION — absence ≠ annulation, jamais de
 * suppression.
 *
 * === Priorités entre règles (tranchées ici, verrouillées par les tests) ===
 *
 *   1. `skip-locked` prime sur TOUT (y compris `conflict` et `postpone`) :
 *      un événement verrouillé n'est JAMAIS écrit, quelle que soit la
 *      raison qui aurait justifié une écriture.
 *   2. `conflict` prime sur `reschedule-reset-attendances` et `update` :
 *      une saisie manuelle détectée bloque toute écriture automatique,
 *      même si le district a par ailleurs décalé la date.
 *   3. `postpone` prime sur `update`/`reschedule-reset-attendances`/`noop`
 *      (mais pas sur `skip-locked` ni `conflict`, cf. 1 et 2).
 *   4. `reschedule-reset-attendances` prime sur `update` simple dès lors
 *      que `hasAttendances` est vrai ET que la date change.
 *   5. `noop` uniquement si aucune donnée n'a changé ET aucun conflit ET
 *      pas de verrouillage.
 *
 * Hors-scope explicite (cf. TODO lot 9/10) :
 *   - pas de test de rendu du calendrier ;
 *   - pas de test des notifications aux joueurs ;
 *   - pas de mock Supabase (fonction pure, aucune I/O).
 */

import { describe, it, expect } from "vitest";
import { planEventSync } from "@/lib/dofa/event-sync";
import type { DofaMatch, DofaMatchTeam } from "@/lib/dofa/parse-matches";
import type { TeamIdentity } from "@/lib/dofa/types";

/** Identité du club coach utilisée dans tout le fichier (cf. briefing). */
const COACH_TEAM: TeamIdentity = { clNo: 10428, number: 1 };

function team(clNo: number, number: number, shortName: string): DofaMatchTeam {
  return { clNo, number, shortName };
}

/** Construit un DofaMatch minimal et valide, avec des valeurs par défaut surchargeables. */
function buildMatch(overrides: Partial<DofaMatch> = {}): DofaMatch {
  return {
    maNo: 1,
    matchday: 1,
    kickoff: "2026-09-06T15:00",
    date: "2026-09-06T00:00:00+00:00",
    homeTeam: team(10428, 1, "CAMPHIN PEVELE ECF"),
    awayTeam: team(6956, 2, "WATTIGNIES FC"),
    homeScore: null,
    awayScore: null,
    homeIsForfeit: false,
    awayIsForfeit: false,
    location: {
      name: "STADE MUNICIPAL",
      address: "2 RUE DE LA BASSE COUTURE",
      zipCode: "59780",
      city: "CAMPHIN EN PEVELE",
    },
    seemsPostponed: false,
    status: "A",
    ...overrides,
  };
}

/** Réplique la concaténation attendue du lieu, pour construire les assertions et les fixtures. */
function expectedLocationString(match: DofaMatch): string | null {
  if (!match.location) return null;
  return [match.location.name, match.location.address, match.location.city]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

const NOMINAL_KICKOFF = "2026-09-06T15:00";
const NOMINAL_LOCATION = "STADE MUNICIPAL, 2 RUE DE LA BASSE COUTURE, CAMPHIN EN PEVELE";
// now bien après le match (hors grâce des 3h) → verrouillé
const LOCKED_NOW = new Date("2026-09-07T00:00:00Z").getTime();
// now bien avant le match → pas verrouillé
const NOT_LOCKED_NOW = new Date("2026-09-01T00:00:00Z").getTime();

describe("planEventSync — nominal critique (création)", () => {
  it("un match sans événement correspondant produit `create` avec opponent = l'équipe adverse du coach (home)", () => {
    const match = buildMatch();
    const actions = planEventSync([match], [], NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([
      {
        action: "create",
        maNo: 1,
        event: {
          type: "match",
          event_date: NOMINAL_KICKOFF,
          opponent: "WATTIGNIES FC",
          location: NOMINAL_LOCATION,
        },
      },
    ]);
  });

  it("quand le coach est l'équipe visiteuse, opponent = l'équipe à domicile (identité par cl_no + number, jamais le nom seul)", () => {
    const match = buildMatch({
      homeTeam: team(918, 2, "BOUSBECQUE CS"),
      awayTeam: team(10428, 1, "CAMPHIN PEVELE ECF"),
    });
    const actions = planEventSync([match], [], NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action: "create",
      event: { opponent: "BOUSBECQUE CS" },
    });
  });
});

describe("planEventSync — idempotence (critique)", () => {
  it("un match déjà importé (event lié, données inchangées) produit `noop`, jamais `create`", () => {
    const match = buildMatch();
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([{ action: "noop", maNo: 1, eventId: "evt-1" }]);
  });

  it("une deuxième passe sur les 3 matchs de la fixture réelle, sans aucun changement, ne produit QUE des `noop`", () => {
    const matches = [
      buildMatch({
        maNo: 56363596,
        kickoff: "2026-09-06T13:00",
        homeTeam: team(206181, 6, "PEVELE FC"),
        awayTeam: team(918, 2, "BOUSBECQUE CS"),
        location: {
          name: "COMPLEXE SPORTIF LÉON DALLE 1",
          address: "23 BIS RUE DE LINSELLES",
          zipCode: "59166",
          city: "BOUSBECQUE",
        },
      }),
      buildMatch({ maNo: 56363599 }),
      buildMatch({
        maNo: 56363601,
        kickoff: "2026-09-06T13:00",
        homeTeam: team(15478, 2, "TOUFFLERS AF"),
        awayTeam: team(796, 10, "LEERS OS"),
        location: {
          name: "COMPLEXE SPORTIF 2",
          address: null,
          zipCode: null,
          city: null,
        },
      }),
    ];

    const existing = matches.map((m, i) => ({
      dofaMaNo: m.maNo,
      eventId: `evt-${i}`,
      eventDate: m.kickoff,
      endDate: null,
      location: expectedLocationString(m),
      hasAttendances: false,
      lastImportedKickoff: m.kickoff,
      lastImportedLocation: expectedLocationString(m),
    }));

    const actions = planEventSync(matches, existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toHaveLength(3);
    expect(actions.every((a) => a.action === "noop")).toBe(true);
  });

  it("un décalage légitime de date (pas de saisie manuelle, pas de convocation) produit `update`, jamais `create`", () => {
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF, // ancienne date en base
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF, // = eventDate → pas de saisie manuelle
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([
      {
        action: "update",
        maNo: 1,
        eventId: "evt-1",
        changes: { event_date: "2026-09-13T15:00" },
      },
    ]);
  });
});

describe("planEventSync — non-écrasement d'une saisie manuelle (critique)", () => {
  it("un événement dont la date actuelle diffère de la dernière valeur importée produit `conflict`, jamais `update`", () => {
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: "2026-09-08T18:00", // le coach a modifié l'heure à la main
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF, // valeur écrite au dernier import ≠ eventDate actuel
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe("conflict");
    expect(actions[0]).toMatchObject({ maNo: 1, eventId: "evt-1" });
  });

  it("un événement dont le LIEU actuel diffère de la dernière valeur importée produit aussi `conflict`", () => {
    const match = buildMatch();
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: "GYMNASE MUNICIPAL (changé à la main par le coach)",
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION, // ≠ location actuelle
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions[0].action).toBe("conflict");
  });
});

describe("planEventSync — verrouillage (critique, réutilise isEventLocked)", () => {
  it("un événement verrouillé produit `skip-locked`, aucune tentative d'écriture même si les données ont changé", () => {
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF, // événement passé
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([{ action: "skip-locked", maNo: 1, eventId: "evt-1" }]);
  });

  it("un événement verrouillé SANS aucun changement produit quand même `skip-locked`, pas `noop` (priorité verrouillée)", () => {
    const match = buildMatch();
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, LOCKED_NOW, COACH_TEAM);

    expect(actions[0].action).toBe("skip-locked");
  });
});

describe("planEventSync — convocations (reschedule-reset-attendances)", () => {
  it("un décalage de date sur un événement AVEC convocations produit `reschedule-reset-attendances`, distinct de `update`", () => {
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: true, // convocations déjà envoyées
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([
      {
        action: "reschedule-reset-attendances",
        maNo: 1,
        eventId: "evt-1",
        changes: { event_date: "2026-09-13T15:00" },
      },
    ]);
  });

  it("un décalage de date sur un événement SANS convocation reste un `update` ordinaire (pas de notification pour rien)", () => {
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions[0].action).toBe("update");
  });

  it("une convocation existante SANS décalage de date (seul le lieu change, pas de conflit) reste un `update` simple", () => {
    const match = buildMatch({
      location: { name: "AUTRE STADE", address: null, zipCode: null, city: null },
    });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF, // date inchangée
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: true,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    // Le changement de lieu seul ne réinitialise pas les convocations :
    // seul un décalage de DATE justifie reschedule-reset-attendances.
    expect(actions[0].action).toBe("update");
  });
});

describe("planEventSync — report (seems_postponed)", () => {
  it("`seemsPostponed` produit `postpone`, jamais de suppression d'événement", () => {
    const match = buildMatch({ seemsPostponed: true });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([{ action: "postpone", maNo: 1, eventId: "evt-1" }]);
    expect(actions.some((a) => (a.action as string) === "delete")).toBe(false);
  });

  it("`seemsPostponed` sur un match encore jamais importé produit `postpone` avec `eventId: null`, pas de `create`", () => {
    const match = buildMatch({ seemsPostponed: true });
    const actions = planEventSync([match], [], NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([{ action: "postpone", maNo: 1, eventId: null }]);
  });
});

describe("planEventSync — anti-régression CAPITALE : absence ≠ annulation", () => {
  it("un match retiré du flux DOFA (event existant mais absent de `matches`) ne produit AUCUNE action de suppression, ni aucune action du tout pour lui", () => {
    // Le match maNo=1 a été importé précédemment (existingEvents le référence)
    // mais n'apparaît PLUS dans le flux DOFA courant (page paginée, retrait,
    // panne réseau partielle...). Il ne doit générer NI delete NI toute autre
    // action : silence total, l'événement reste tel quel en base.
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: true,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions).toEqual([]);
    expect(actions.some((a) => (a.action as string) === "delete")).toBe(false);
  });
});

describe("planEventSync — priorités entre règles (combinaisons tranchées)", () => {
  it("verrouillé ET saisie manuelle (conflit) → `skip-locked` prime, jamais `conflict`", () => {
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: "2026-09-08T18:00", // saisie manuelle détectée
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF, // ≠ eventDate → conflit
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, LOCKED_NOW, COACH_TEAM);

    expect(actions[0].action).toBe("skip-locked");
  });

  it("verrouillé ET `seemsPostponed` → `skip-locked` prime, jamais `postpone` (aucune écriture sur un événement passé)", () => {
    const match = buildMatch({ seemsPostponed: true });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, LOCKED_NOW, COACH_TEAM);

    expect(actions[0].action).toBe("skip-locked");
  });

  it("saisie manuelle (conflit) ET convocations avec décalage de date → `conflict` prime, jamais `reschedule-reset-attendances`", () => {
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: "2026-09-08T18:00", // saisie manuelle
        endDate: null,
        location: NOMINAL_LOCATION,
        hasAttendances: true, // convocations existantes
        lastImportedKickoff: NOMINAL_KICKOFF, // ≠ eventDate → conflit
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, NOT_LOCKED_NOW, COACH_TEAM);

    expect(actions[0].action).toBe("conflict");
  });

  it("`endDate` verrouille l'événement même si `eventDate` seul ne le ferait pas (délègue bien à `isEventLocked`, ne duplique pas la règle des 3h)", () => {
    // event_date proche de `now` (a priori pas verrouillé sur la règle des 3h
    // seule) mais `endDate` renseignée et déjà passée → verrouillé, cf.
    // isEventLocked(eventDate, endDate, now).
    const now = new Date("2026-09-06T16:00:00Z").getTime(); // 1h après le kickoff, < 3h de grâce
    const match = buildMatch({ kickoff: "2026-09-13T15:00" });
    const existing = [
      {
        dofaMaNo: 1,
        eventId: "evt-1",
        eventDate: NOMINAL_KICKOFF,
        endDate: "2026-09-06T15:30:00Z", // fin déjà passée
        location: NOMINAL_LOCATION,
        hasAttendances: false,
        lastImportedKickoff: NOMINAL_KICKOFF,
        lastImportedLocation: NOMINAL_LOCATION,
      },
    ];

    const actions = planEventSync([match], existing, now, COACH_TEAM);

    expect(actions[0].action).toBe("skip-locked");
  });
});
