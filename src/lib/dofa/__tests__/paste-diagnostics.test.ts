import { describe, expect, it } from "vitest";
import { diagnoseDofaPaste } from "../paste-diagnostics";
import { MAX_INGEST_BYTES, MAX_INGEST_MATCHES } from "../ingest-validation";
import type { DofaPouleRef } from "../types";

const TRIPLET: DofaPouleRef = { cp_no: 452059, phase: 1, poule: 1 };

/** Match DOFA minimal mais complet (forme des fixtures réelles). */
function dofaMatch(overrides: Record<string, unknown> = {}) {
  return {
    ma_no: 100001,
    date: "2026-09-06T00:00:00+00:00",
    time: "10:00:00",
    home_score: null,
    away_score: null,
    home_is_forfeit: "N",
    away_is_forfeit: "N",
    seems_postponed: "N",
    status: null,
    competition: { cp_no: 452059 },
    phase: { number: 1 },
    poule: { stage_number: 1 },
    poule_journee: { number: 1 },
    home: { club: { cl_no: 600001 }, number: 1, short_name: "ECC U14" },
    away: { club: { cl_no: 600002 }, number: 2, short_name: "LILLE OGC" },
    terrain: null,
    ...overrides,
  };
}

describe("diagnoseDofaPaste", () => {
  it("accepte un lot cohérent et ne renvoie rien", () => {
    expect(diagnoseDofaPaste([dofaMatch(), dofaMatch({ ma_no: 100002 })], TRIPLET)).toBeNull();
  });

  it("signale une page qui ne contient aucun match (Classement, journées…)", () => {
    // Page « Classement » : une liste d'équipes, pas de `ma_no`.
    const standings = [
      { club: { cl_no: 600001, short_name: "ECC U14" }, number: 1, points: 12 },
      { club: { cl_no: 600002, short_name: "LILLE OGC" }, number: 2, points: 9 },
    ];
    const problem = diagnoseDofaPaste(standings, TRIPLET);
    expect(problem?.code).toBe("no_matches");
    expect(problem?.message).toMatch(/Aucun match exploitable/i);
  });

  it("signale une liste de journées collée à la place des matchs", () => {
    const journees = [
      { number: 1, name: "Journée 1", date: "2026-09-06" },
      { number: 2, name: "Journée 2", date: "2026-09-13" },
    ];
    expect(diagnoseDofaPaste(journees, TRIPLET)?.code).toBe("no_matches");
  });

  it("signale un lot partiellement lisible (match sans équipes)", () => {
    const broken = dofaMatch({ ma_no: 100003, home: null });
    const problem = diagnoseDofaPaste([dofaMatch(), broken], TRIPLET);
    expect(problem?.code).toBe("partial_matches");
    expect(problem?.message).toMatch(/1 matchs sur 2/);
  });

  it("signale un match dont l'équipe n'a pas de numéro (structure inattendue)", () => {
    const noNumber = dofaMatch({
      ma_no: 100004,
      home: { club: { cl_no: 600001 }, short_name: "ECC U14" },
    });
    expect(diagnoseDofaPaste([dofaMatch(), noNumber], TRIPLET)?.code).toBe("partial_matches");
  });

  it("signale un écart de poule (le motif de refus le plus fréquent)", () => {
    const otherPoule = dofaMatch({
      ma_no: 100005,
      poule: { stage_number: 4 },
    });
    const problem = diagnoseDofaPaste([otherPoule], TRIPLET);
    expect(problem?.code).toBe("triplet_mismatch");
    expect(problem?.message).toMatch(/poule 4/);
    expect(problem?.message).toMatch(/poule 1/);
  });

  it("signale un écart de compétition", () => {
    const otherCp = dofaMatch({ ma_no: 100006, competition: { cp_no: 457587 } });
    expect(diagnoseDofaPaste([otherCp], TRIPLET)?.code).toBe("triplet_mismatch");
  });

  it("signale un écart de phase", () => {
    const otherPhase = dofaMatch({ ma_no: 100007, phase: { number: 2 } });
    expect(diagnoseDofaPaste([otherPhase], TRIPLET)?.code).toBe("triplet_mismatch");
  });

  it("reflète le refus serveur quand le lot contient un élément parasite", () => {
    // Le serveur compare `matches.length` à `items.length` : un `null` ou une
    // valeur parasite fait donc rejeter TOUT le lot (`invalid_matches`). Le
    // diagnostic doit refléter exactement ce comportement, sans l'adoucir —
    // un message divergent de la réalité serait pire qu'un message vague.
    expect(diagnoseDofaPaste([dofaMatch(), null], TRIPLET)?.code).toBe("partial_matches");
  });

  it("traite un tableau vide comme un contenu sans match", () => {
    expect(diagnoseDofaPaste([], TRIPLET)?.code).toBe("no_matches");
  });

  it("signale un lot dépassant la limite de matchs (comme le serveur)", () => {
    const many = Array.from({ length: MAX_INGEST_MATCHES + 1 }, (_, i) =>
      dofaMatch({ ma_no: 200000 + i })
    );
    const problem = diagnoseDofaPaste(many, TRIPLET);
    expect(problem?.code).toBe("too_many_matches");
    expect(problem?.message).toMatch(/501 matchs/);
  });

  it("accepte un lot juste à la limite de matchs", () => {
    const limit = Array.from({ length: MAX_INGEST_MATCHES }, (_, i) =>
      dofaMatch({ ma_no: 300000 + i })
    );
    expect(diagnoseDofaPaste(limit, TRIPLET)).toBeNull();
  });

  it("signale un texte collé trop volumineux (comme le serveur)", () => {
    const huge = "x".repeat(MAX_INGEST_BYTES + 1);
    const problem = diagnoseDofaPaste([dofaMatch()], TRIPLET, huge);
    expect(problem?.code).toBe("payload_too_large");
    expect(problem?.message).toMatch(/page par page/);
  });

  it("mesure la taille en octets, pas en caractères", () => {
    // 4 caractères UTF-8 = 8 octets : un texte sous la limite en caractères
    // peut dépasser la limite en octets (le serveur compte bien les octets).
    const chunk = "\u00e9".repeat(MAX_INGEST_BYTES / 2 + 10);
    expect(new TextEncoder().encode(chunk).length).toBeGreaterThan(MAX_INGEST_BYTES);
    expect(diagnoseDofaPaste([dofaMatch()], TRIPLET, chunk)?.code).toBe("payload_too_large");
  });

  it("n'applique le contrôle de taille que si le texte brut est fourni", () => {
    expect(diagnoseDofaPaste([dofaMatch()], TRIPLET)).toBeNull();
  });
});