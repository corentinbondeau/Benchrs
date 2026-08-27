/**
 * Tests — Classification explicite des erreurs du client DOFA (src/lib/dofa/client.ts)
 *
 * Contexte (diagnostic établi) :
 *   - L'hôte historique `api-dofa.prd-aws.fff.fr` n'existe plus en DNS.
 *   - Les hôtes candidats de remplacement renvoient un 403 Akamai.
 *   - Le vrai défaut logiciel : les erreurs étaient avalées et transformées
 *     en résultat vide silencieux, rendant la panne indiagnosticable.
 *
 * Objectif de ce fichier (NE remplace PAS src/__tests__/lib/dofa-client.test.ts,
 * qui couvre déjà parseTeams/parseMatches et la construction des URLs) :
 *   1. Verrouiller que le client lève une erreur TYPÉE et DISTINGUABLE
 *      (DofaUnavailableError) plutôt qu'une Error générique, avec un `reason`
 *      parmi "network" | "blocked" | "http" et un `status` optionnel.
 *   2. Verrouiller que la base URL n'est plus un hôte mort codé en dur :
 *      elle doit être lue depuis la variable d'environnement DOFA_BASE_URL
 *      (avec une valeur par défaut), et la chaîne littérale
 *      "api-dofa.prd-aws.fff.fr" ne doit plus apparaître nulle part dans le
 *      fichier source src/lib/dofa/client.ts.
 *
 * Phase "Red" attendue :
 *   - TOUS les tests DOIVENT ÉCHOUER — DofaUnavailableError n'existe pas encore
 *     et le fichier client.ts contient toujours l'hôte mort en dur.
 *
 * Note pour @dev :
 *   Ce contrat impose de facto un changement de configuration de la base URL
 *   (lecture via process.env.DOFA_BASE_URL). Le fichier existant
 *   src/__tests__/lib/dofa-client.test.ts hardcode encore l'ancien hôte mort
 *   comme URL attendue dans ses assertions de construction d'URL — il devra
 *   être mis à jour par @dev en cohérence avec la nouvelle valeur par défaut
 *   choisie pour DOFA_BASE_URL (hors périmètre de ce lot de tests, signalé à
 *   @coordinator).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ─── Import du SUT ────────────────────────────────────────────────────────────
import {
  DofaUnavailableError,
  fetchPouleResultats,
  fetchPouleCalendrier,
  fetchPouleClassement,
  fetchPouleMatchs,
  fetchPouleJournees,
  fetchPoule,
} from "@/lib/dofa/client";

/**
 * Triplet de test pour les fonctions orientées poule (lot 4). Les cas de
 * classification d'erreur historiquement verrouillés sur `fetchClubEquipes`
 * (code mort, supprimé) sont désormais portés par `fetchPouleResultats`,
 * fonction réellement utilisée par la route `/api/championships/dofa`.
 * cp_no = 457587, phase = 1, poule = 4 (cf. URLs réelles district Flandres).
 */
const POULE_REF = { cpNo: 457587, phase: 1, poule: 4 };

describe("Client DOFA — classification explicite des erreurs", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lève une DofaUnavailableError(reason: 'network') si fetch rejette (panne réseau/DNS)", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(
      new TypeError("fetch failed: getaddrinfo ENOTFOUND api-dofa.prd-aws.fff.fr")
    );

    await expect(fetchPouleResultats(POULE_REF)).rejects.toMatchObject({
      reason: "network",
    });

    try {
      await fetchPouleResultats(POULE_REF);
    } catch (err) {
      expect(err, "l'erreur doit être une instance de DofaUnavailableError").toBeInstanceOf(
        DofaUnavailableError
      );
    }
  });

  it("lève une DofaUnavailableError(reason: 'blocked') sur une réponse 403 (cas Akamai)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    await expect(fetchPouleResultats(POULE_REF)).rejects.toMatchObject({
      reason: "blocked",
      status: 403,
    });
  });

  it("lève une DofaUnavailableError(reason: 'http', status renseigné) pour un autre statut non-OK (ex. 500)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(fetchPouleResultats(POULE_REF)).rejects.toMatchObject({
      reason: "http",
      status: 500,
    });
  });

  it("ne lève aucune erreur et retourne les données parsées si la réponse est OK", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);

    await expect(fetchPouleResultats(POULE_REF)).resolves.toEqual([]);
  });

  it("un 403 et un 500 sont distinguables via `reason` (403 = blocage, pas une absence de résultat métier)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);
    let reason403: string | undefined;
    try {
      await fetchPouleResultats(POULE_REF);
    } catch (err) {
      reason403 = (err as DofaUnavailableError).reason;
    }

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    let reason500: string | undefined;
    try {
      await fetchPouleResultats(POULE_REF);
    } catch (err) {
      reason500 = (err as DofaUnavailableError).reason;
    }

    expect(reason403).toBe("blocked");
    expect(reason500).toBe("http");
    expect(reason403).not.toBe(reason500);
  });
});

describe("Client DOFA — base URL configurable (garde-fou anti-régression)", () => {
  const clientSourcePath = path.join(process.cwd(), "src/lib/dofa/client.ts");
  const source = fs.readFileSync(clientSourcePath, "utf-8");

  it("ne contient plus l'hôte mort 'api-dofa.prd-aws.fff.fr' en dur dans le fichier", () => {
    expect(
      source.includes("api-dofa.prd-aws.fff.fr"),
      "L'hôte mort ne doit plus apparaître nulle part dans src/lib/dofa/client.ts — il doit être remplacé par une lecture de process.env.DOFA_BASE_URL avec une valeur par défaut différente."
    ).toBe(false);
  });

  it("lit la base URL depuis la variable d'environnement DOFA_BASE_URL", () => {
    expect(
      source.includes("DOFA_BASE_URL"),
      "La base URL doit être lue depuis process.env.DOFA_BASE_URL (avec fallback par défaut)."
    ).toBe(true);
  });

  it("respecte réellement la variable d'environnement DOFA_BASE_URL au runtime", async () => {
    const previous = process.env.DOFA_BASE_URL;
    process.env.DOFA_BASE_URL = "https://dofa-test.example.test";
    vi.resetModules();

    try {
      const { fetchPouleResultats: fetchPouleResultatsFresh } = await import("@/lib/dofa/client");
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      await fetchPouleResultatsFresh(POULE_REF);

      const calledUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(calledUrl.startsWith("https://dofa-test.example.test")).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.DOFA_BASE_URL;
      } else {
        process.env.DOFA_BASE_URL = previous;
      }
      vi.resetModules();
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Lot 4 — Nouvelles fonctions orientées poule (modèle compétition).
 *
 * Contrat visé pour chaque fonction : appeler
 *   {DOFA_BASE_URL}/api/compets/{cpNo}/phases/{phase}/poules/{poule}/{ressource}
 * avec le mapping ressource suivant :
 *   fetchPouleResultats   → "resultat"
 *   fetchPouleCalendrier  → "calendrier"
 *   fetchPouleClassement  → "classement_journees"
 *   fetchPouleMatchs      → "matchs"
 *   fetchPouleJournees    → "poule_journees"
 *   fetchPoule            → pas de ressource finale (la poule elle-même :
 *                            "/api/compets/{cpNo}/phases/{phase}/poules/{poule}")
 *
 * ⚠️ Anti-régression capitale : la classification DofaUnavailableError
 * (network / blocked 403 / http) doit être IDENTIQUE à celle déjà verrouillée
 * ci-dessus pour fetchPouleResultats. Ces tests le reverrouillent explicitement
 * sur les nouvelles fonctions, pour qu'un futur refactor du client ne puisse
 * jamais faire regresser une vraie panne en "aucun résultat" silencieux.
 *
 * Phase "Red" attendue : ces fonctions n'existent pas encore dans
 * src/lib/dofa/client.ts → échec d'import / TypeError à l'exécution.
 * Aucun code de production n'a été écrit par cet agent.
 * ─────────────────────────────────────────────────────────────────────────
 */

type PouleFetcher = (ref: typeof POULE_REF) => Promise<unknown>;

const POULE_FETCHERS: Array<{ name: string; fn: PouleFetcher; resource: string }> = [
  { name: "fetchPouleResultats", fn: fetchPouleResultats, resource: "resultat" },
  { name: "fetchPouleCalendrier", fn: fetchPouleCalendrier, resource: "calendrier" },
  { name: "fetchPouleClassement", fn: fetchPouleClassement, resource: "classement_journees" },
  { name: "fetchPouleMatchs", fn: fetchPouleMatchs, resource: "matchs" },
  { name: "fetchPouleJournees", fn: fetchPouleJournees, resource: "poule_journees" },
];

describe("Client DOFA orienté poule — construction des URLs (lot 4)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  for (const { name, fn, resource } of POULE_FETCHERS) {
    it(`${name} appelle /api/compets/{cpNo}/phases/{phase}/poules/{poule}/${resource}`, async () => {
      await fn(POULE_REF);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(calledUrl).toContain(
        `/api/compets/${POULE_REF.cpNo}/phases/${POULE_REF.phase}/poules/${POULE_REF.poule}/${resource}`
      );
    });
  }

  it("fetchPoule appelle la poule elle-même, sans suffixe de ressource", async () => {
    await fetchPoule(POULE_REF);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain(
      `/api/compets/${POULE_REF.cpNo}/phases/${POULE_REF.phase}/poules/${POULE_REF.poule}`
    );
    // Ne doit pas accidentellement matcher un suffixe de ressource connu.
    expect(calledUrl.endsWith(`/poules/${POULE_REF.poule}`)).toBe(true);
  });

  it("la base URL des fonctions poule reste pilotée par DOFA_BASE_URL", async () => {
    const previous = process.env.DOFA_BASE_URL;
    process.env.DOFA_BASE_URL = "https://dofa-test.example.test";
    vi.resetModules();

    try {
      const { fetchPouleResultats: fetchFresh } = await import("@/lib/dofa/client");
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      await fetchFresh(POULE_REF);

      const calledUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
      expect(calledUrl.startsWith("https://dofa-test.example.test")).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.DOFA_BASE_URL;
      } else {
        process.env.DOFA_BASE_URL = previous;
      }
      vi.resetModules();
    }
  });
});

describe("Client DOFA orienté poule — anti-régression DofaUnavailableError (lot 4)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  for (const { name, fn } of POULE_FETCHERS) {
    it(`${name} lève DofaUnavailableError(reason: 'network') si fetch rejette`, async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new TypeError("fetch failed: network down"));

      await expect(fn(POULE_REF)).rejects.toBeInstanceOf(DofaUnavailableError);
      await expect(fn(POULE_REF)).rejects.toMatchObject({ reason: "network" });
    });

    it(`${name} lève DofaUnavailableError(reason: 'blocked', status: 403) sur un 403`, async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      } as Response);

      await expect(fn(POULE_REF)).rejects.toMatchObject({ reason: "blocked", status: 403 });
    });

    it(`${name} lève DofaUnavailableError(reason: 'http', status: 500) sur un autre statut non-OK`, async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      await expect(fn(POULE_REF)).rejects.toMatchObject({ reason: "http", status: 500 });
    });
  }

  it("fetchPoule respecte la même classification (network / blocked / http)", async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(fetchPoule(POULE_REF)).rejects.toMatchObject({ reason: "network" });

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);
    await expect(fetchPoule(POULE_REF)).rejects.toMatchObject({ reason: "blocked", status: 403 });

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    await expect(fetchPoule(POULE_REF)).rejects.toMatchObject({ reason: "http", status: 500 });
  });
});
