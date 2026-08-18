/**
 * Tests — Service DOFA centralisé (src/lib/dofa/client.ts)
 *
 * Périmètre :
 *   1. fetchClubEquipes  : retourne le tableau d'équipes, URL correcte, erreur réseau
 *   2. fetchCalendrier   : retourne des matchs parsés, URL correcte
 *   3. fetchResultats    : retourne des matchs avec scores, URL correcte
 *   4. fetchClassement   : NOUVEAU — retourne les équipes du classement triées par points
 *   5. Construction URLs : vérification que chaque fonction appelle la bonne URL DOFA
 *   6. Erreurs HTTP      : 404 → throw Error, 500 → throw Error
 *
 * Hors-scope :
 *   - Tests d'intégration réseau réels contre api-dofa.prd-aws.fff.fr
 *   - Logique d'authentification Supabase (testée dans la route)
 *   - Fusion calendrier/résultats (logique de la route, pas du client)
 *
 * Phase "Red" attendue :
 *   - TOUS les tests DOIVENT ÉCHOUER — src/lib/dofa/client.ts n'existe pas encore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Import du SUT (module à créer) ──────────────────────────────────────────
import {
  fetchClubEquipes,
  fetchCalendrier,
  fetchResultats,
  fetchClassement,
} from "@/lib/dofa/client";

// ─── Constantes ───────────────────────────────────────────────────────────────

const BASE_URL = "https://api-dofa.prd-aws.fff.fr";
const FFF_NUMBER = "525816";
const EQ_NO = "525816A";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Fixture : une équipe DOFA (DOFAEquipe) */
const FIXTURE_EQUIPE = {
  eqNo: "525816A",
  libelle: "Equipe Senior A",
  competition: { libelle: "Championnat Régional D2" },
};

/** Fixture : un match DOFA (DOFAMatch) — sans score (calendrier futur) */
const FIXTURE_MATCH_CALENDRIER = {
  idRencontre: "REN-001",
  dateMatch: "2025-09-15T18:00:00",
  heureMatch: "18:00",
  libelle: "FC A - FC B",
  equipeAccueil: { libelle: "FC A" },
  equipeVisiteur: { libelle: "FC B" },
  stade: { libelle: "Stade X" },
};

/** Fixture : un match DOFA (DOFAMatch) — avec scores (résultat passé) */
const FIXTURE_MATCH_RESULTAT = {
  idRencontre: "REN-002",
  dateMatch: "2025-08-20T15:00:00",
  heureMatch: "15:00",
  libelle: "FC B - FC A",
  equipeAccueil: { libelle: "FC B", score: 1 },
  equipeVisiteur: { libelle: "FC A", score: 2 },
  stade: { libelle: "Stade Y" },
};

/** Fixture : une équipe au classement (DOFATeam) */
const FIXTURE_TEAM_CLASSEMENT = {
  libelle: "FC A",
  nbPoints: 15,
  nbMatchsJoues: 7,
  nbVictoires: 5,
  nbNuls: 0,
  nbDefaites: 2,
  nbButsPour: 12,
  nbButsContre: 5,
};

const FIXTURE_TEAM_CLASSEMENT_2 = {
  libelle: "FC B",
  nbPoints: 9,
  nbMatchsJoues: 7,
  nbVictoires: 3,
  nbNuls: 0,
  nbDefaites: 4,
  nbButsPour: 8,
  nbButsContre: 11,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simule une réponse fetch OK avec un payload JSON quelconque. */
function makeJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Simule une réponse fetch avec un statut d'erreur. */
function makeErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: "error" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.spyOn(global, "fetch");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. fetchClubEquipes
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchClubEquipes — cas nominal", () => {
  it("retourne un tableau d'équipes avec eqNo, libelle et competition", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeJsonResponse([FIXTURE_EQUIPE])
    );

    const result = await fetchClubEquipes(FFF_NUMBER);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      eqNo: "525816A",
      libelle: "Equipe Senior A",
    });
  });

  it("retourne un tableau vide si l'API renvoie un tableau vide", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeJsonResponse([]));

    const result = await fetchClubEquipes(FFF_NUMBER);

    expect(result).toEqual([]);
  });

  it("appelle la bonne URL DOFA pour les équipes du club", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([FIXTURE_EQUIPE]));

    await fetchClubEquipes(FFF_NUMBER);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/clubs/${FFF_NUMBER}/equipes.json`);
  });
});

describe("fetchClubEquipes — erreur réseau", () => {
  it("propage l'erreur si fetch échoue (panne réseau)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

    await expect(fetchClubEquipes(FFF_NUMBER)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. fetchCalendrier
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchCalendrier — cas nominal", () => {
  it("retourne les matchs parsés avec les champs attendus", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeJsonResponse([FIXTURE_MATCH_CALENDRIER])
    );

    const result = await fetchCalendrier(FFF_NUMBER, EQ_NO);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2025-09-15",
      home_team: "FC A",
      away_team: "FC B",
      home_score: null,
      away_score: null,
      location: "Stade X",
    });
  });

  it("appelle la bonne URL DOFA pour le calendrier", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([FIXTURE_MATCH_CALENDRIER]));

    await fetchCalendrier(FFF_NUMBER, EQ_NO);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/api/clubs/${FFF_NUMBER}/equipes/${EQ_NO}/calendrier`
    );
  });

  it("retourne un tableau vide si l'API renvoie un tableau vide", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeJsonResponse([]));

    const result = await fetchCalendrier(FFF_NUMBER, EQ_NO);

    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. fetchResultats
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchResultats — cas nominal", () => {
  it("retourne les matchs avec scores remplis", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeJsonResponse([FIXTURE_MATCH_RESULTAT])
    );

    const result = await fetchResultats(FFF_NUMBER, EQ_NO);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: "2025-08-20",
      home_team: "FC B",
      away_team: "FC A",
      home_score: 1,
      away_score: 2,
    });
  });

  it("appelle la bonne URL DOFA pour les résultats", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([FIXTURE_MATCH_RESULTAT]));

    await fetchResultats(FFF_NUMBER, EQ_NO);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/api/clubs/${FFF_NUMBER}/equipes/${EQ_NO}/resultat`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. fetchClassement (NOUVEAU)
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchClassement — cas nominal", () => {
  it("retourne un tableau d'équipes au classement avec les champs attendus", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeJsonResponse([FIXTURE_TEAM_CLASSEMENT])
    );

    const result = await fetchClassement(FFF_NUMBER, EQ_NO);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      team_name: "FC A",
      points: 15,
      played: 7,
      won: 5,
      drawn: 0,
      lost: 2,
      goals_for: 12,
      goals_against: 5,
    });
  });

  it("retourne les équipes triées par points décroissants", async () => {
    // FC B (9 pts) puis FC A (15 pts) dans l'ordre de la réponse — doit être inversé
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeJsonResponse([FIXTURE_TEAM_CLASSEMENT_2, FIXTURE_TEAM_CLASSEMENT])
    );

    const result = await fetchClassement(FFF_NUMBER, EQ_NO);

    expect(result[0].team_name).toBe("FC A");
    expect(result[0].points).toBe(15);
    expect(result[1].team_name).toBe("FC B");
    expect(result[1].points).toBe(9);
  });

  it("appelle la bonne URL DOFA pour le classement", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([FIXTURE_TEAM_CLASSEMENT]));

    await fetchClassement(FFF_NUMBER, EQ_NO);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/api/clubs/${FFF_NUMBER}/equipes/${EQ_NO}/classement`
    );
  });

  it("retourne un tableau vide si l'API renvoie un tableau vide", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeJsonResponse([]));

    const result = await fetchClassement(FFF_NUMBER, EQ_NO);

    expect(result).toEqual([]);
  });

  it("chaque entrée du classement possède un champ id (string non vide)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      makeJsonResponse([FIXTURE_TEAM_CLASSEMENT])
    );

    const result = await fetchClassement(FFF_NUMBER, EQ_NO);

    expect(typeof result[0].id).toBe("string");
    expect(result[0].id.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Construction URLs — vérification transverse
// ─────────────────────────────────────────────────────────────────────────────

describe("Construction des URLs DOFA", () => {
  it("fetchClubEquipes : URL sans eqNo, avec suffixe .json", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([]));

    await fetchClubEquipes("123456");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/clubs/123456/equipes.json`);
    expect(url).not.toContain("equipes/");
  });

  it("fetchCalendrier : URL avec fffNumber et eqNo", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([]));

    await fetchCalendrier("123456", "123456A");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/api/clubs/123456/equipes/123456A/calendrier`
    );
  });

  it("fetchResultats : URL avec fffNumber et eqNo, endpoint /resultat", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([]));

    await fetchResultats("123456", "123456A");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/api/clubs/123456/equipes/123456A/resultat`
    );
  });

  it("fetchClassement : URL avec fffNumber et eqNo, endpoint /classement", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([]));

    await fetchClassement("123456", "123456A");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `${BASE_URL}/api/clubs/123456/equipes/123456A/classement`
    );
  });

  it("toutes les URLs commencent par le bon domaine DOFA", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeJsonResponse([]));

    await fetchClubEquipes(FFF_NUMBER);
    await fetchCalendrier(FFF_NUMBER, EQ_NO);
    await fetchResultats(FFF_NUMBER, EQ_NO);
    await fetchClassement(FFF_NUMBER, EQ_NO);

    for (const call of fetchSpy.mock.calls) {
      const [url] = call;
      expect(url as string).toMatch(/^https:\/\/api-dofa\.prd-aws\.fff\.fr\//);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Erreurs HTTP
// ─────────────────────────────────────────────────────────────────────────────

describe("Erreurs HTTP DOFA", () => {
  it("throw une Error si l'API répond 404", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeErrorResponse(404));

    await expect(fetchClubEquipes(FFF_NUMBER)).rejects.toThrow();
  });

  it("l'erreur 404 contient le code HTTP dans le message", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeErrorResponse(404));

    await expect(fetchClubEquipes(FFF_NUMBER)).rejects.toThrow(/404/);
  });

  it("throw une Error si l'API répond 500", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeErrorResponse(500));

    await expect(fetchCalendrier(FFF_NUMBER, EQ_NO)).rejects.toThrow();
  });

  it("throw une Error 500 pour fetchResultats", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeErrorResponse(500));

    await expect(fetchResultats(FFF_NUMBER, EQ_NO)).rejects.toThrow();
  });

  it("throw une Error 500 pour fetchClassement", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeErrorResponse(500));

    await expect(fetchClassement(FFF_NUMBER, EQ_NO)).rejects.toThrow();
  });

  it("propage l'erreur réseau (fetch throw) pour fetchCalendrier", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      new Error("fetch failed: ECONNREFUSED")
    );

    await expect(fetchCalendrier(FFF_NUMBER, EQ_NO)).rejects.toThrow(
      /ECONNREFUSED|fetch failed/i
    );
  });
});
