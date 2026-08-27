import { describe, it, expect } from "vitest";
import { toMatchLineupRows } from "./toMatchLineups";
import type { FormationData } from "@/types";

/**
 * Contrat (TODO lot 7, §7.1 + tâche @test) :
 *   toMatchLineupRows(formationData: FormationData, eventId: string, teamId: string): MatchLineupRow[]
 *
 *   interface MatchLineupRow {
 *     event_id: string;
 *     player_id: string;
 *     position_label: string | null;
 *     is_starter: boolean;
 *     team_id: string;
 *   }
 *
 * Fonction PURE : aucune I/O, projection déterministe de `formation_data` (source riche,
 * persistée dans `formations`) vers les lignes à écrire dans `match_lineups` (projection
 * dénormalisée, reconstructible via DELETE+INSERT — cf §7.2/§7.3 du TODO).
 *
 * 🔒 Contraintes de schéma verrouillées par ces tests (000_full_schema.sql:152-161,
 * 004_multi_team.sql:59, 005_rls_team_scoped.sql:239-241) :
 *   - `event_id` NOT NULL et `player_id` NOT NULL → aucune ligne ne doit jamais porter
 *     un `player_id` null (un slot vide ou une place de banc vide doit être filtré, pas
 *     traduit en ligne avec player_id: null, sous peine d'erreur SQL).
 *   - `team_id` doit être renseigné sur CHAQUE ligne : la policy RLS `FOR ALL USING
 *     (team_id IN (...))` sert aussi de `WITH CHECK` implicite ; un `team_id` NULL évalue
 *     `NULL IN (...)` → NULL → INSERT rejeté silencieusement. C'est le verrou critique du lot.
 *   - Aucune contrainte UNIQUE (event_id, player_id) en base → un même joueur ne doit
 *     jamais apparaître deux fois (titulaire + remplaçant) dans le jeu de lignes produit,
 *     sinon rien ne l'empêcherait côté base.
 */

const EVENT_ID = "event-123";
const TEAM_ID = "team-abc";

describe("toMatchLineupRows", () => {
  it("projette les titulaires en lignes is_starter: true avec le position_label du slot", () => {
    const formationData: FormationData = {
      positions: [
        { player_id: "p1", x: 50, y: 90, label: "Gardien" },
        { player_id: "p2", x: 15, y: 70, label: "Arrière G" },
      ],
    };

    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);

    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({
      event_id: EVENT_ID,
      player_id: "p1",
      position_label: "Gardien",
      is_starter: true,
      team_id: TEAM_ID,
    });
    expect(rows).toContainEqual({
      event_id: EVENT_ID,
      player_id: "p2",
      position_label: "Arrière G",
      is_starter: true,
      team_id: TEAM_ID,
    });
  });

  it("projette les remplaçants du banc en lignes is_starter: false", () => {
    const formationData: FormationData = {
      positions: [{ player_id: "p1", x: 50, y: 90, label: "Gardien" }],
      bench: ["p2", "p3"],
    };

    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);

    const benchRows = rows.filter((r) => r.player_id === "p2" || r.player_id === "p3");
    expect(benchRows).toHaveLength(2);
    for (const row of benchRows) {
      expect(row.is_starter, `player_id=${row.player_id} devrait être un remplaçant`).toBe(false);
    }
  });

  it("ne produit AUCUNE ligne pour un slot titulaire vide (player_id: null) — contrainte NOT NULL", () => {
    const formationData: FormationData = {
      positions: [
        { player_id: "p1", x: 50, y: 90, label: "Gardien" },
        { player_id: null as unknown as string, x: 38, y: 72, label: "Défenseur" },
      ],
    };

    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);

    expect(rows).toHaveLength(1);
    expect(rows.some((r) => r.player_id === null)).toBe(false);
  });

  it("ne produit AUCUNE ligne pour une place de banc vide (null) — contrainte NOT NULL", () => {
    const formationData: FormationData = {
      positions: [{ player_id: "p1", x: 50, y: 90, label: "Gardien" }],
      bench: ["p2", null, null],
    };

    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);

    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.player_id === null)).toBe(false);
  });

  it("renseigne team_id sur TOUTES les lignes (verrou anti-RLS : NULL IN (...) => rejet silencieux)", () => {
    const formationData: FormationData = {
      positions: [
        { player_id: "p1", x: 50, y: 90, label: "Gardien" },
        { player_id: "p2", x: 15, y: 70, label: "Arrière G" },
      ],
      bench: ["p3"],
    };

    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.team_id, `ligne player_id=${row.player_id} sans team_id`).toBe(TEAM_ID);
    }
  });

  it("propage event_id sur toutes les lignes", () => {
    const formationData: FormationData = {
      positions: [{ player_id: "p1", x: 50, y: 90, label: "Gardien" }],
      bench: ["p2"],
    };

    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);

    for (const row of rows) {
      expect(row.event_id).toBe(EVENT_ID);
    }
  });

  it("ne fait jamais apparaître un même player_id deux fois (titulaire ET remplaçant) — pas de UNIQUE en base", () => {
    // Cas anormal en théorie (un joueur ne devrait pas être aux deux endroits), mais rien
    // en amont ne le garantit structurellement : la projection doit rester sûre malgré tout.
    const formationData: FormationData = {
      positions: [{ player_id: "p1", x: 50, y: 90, label: "Gardien" }],
      bench: ["p1", "p2"],
    };

    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);

    const playerIds = rows.map((r) => r.player_id);
    expect(new Set(playerIds).size).toBe(playerIds.length);
  });

  it("ne plante pas quand bench et captain_id sont absents (formation_data enregistrées avant cette US)", () => {
    const formationData: FormationData = {
      positions: [{ player_id: "p1", x: 50, y: 90, label: "Gardien" }],
    };

    expect(() => toMatchLineupRows(formationData, EVENT_ID, TEAM_ID)).not.toThrow();
    const rows = toMatchLineupRows(formationData, EVENT_ID, TEAM_ID);
    expect(rows).toHaveLength(1);
  });
});
