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
  fetchClubEquipes,
  DofaUnavailableError,
} from "@/lib/dofa/client";

const FFF_NUMBER = "525816";

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

    await expect(fetchClubEquipes(FFF_NUMBER)).rejects.toMatchObject({
      reason: "network",
    });

    try {
      await fetchClubEquipes(FFF_NUMBER);
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

    await expect(fetchClubEquipes(FFF_NUMBER)).rejects.toMatchObject({
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

    await expect(fetchClubEquipes(FFF_NUMBER)).rejects.toMatchObject({
      reason: "http",
      status: 500,
    });
  });

  it("ne lève aucune erreur et retourne les données parsées si la réponse est OK", async () => {
    const equipes = [{ eqNo: "525816A", libelle: "Equipe Senior A" }];
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => equipes,
    } as Response);

    await expect(fetchClubEquipes(FFF_NUMBER)).resolves.toEqual(equipes);
  });

  it("un 403 et un 500 sont distinguables via `reason` (403 = blocage, pas une absence de résultat métier)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);
    let reason403: string | undefined;
    try {
      await fetchClubEquipes(FFF_NUMBER);
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
      await fetchClubEquipes(FFF_NUMBER);
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
      const { fetchClubEquipes: fetchClubEquipesFresh } = await import("@/lib/dofa/client");
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      await fetchClubEquipesFresh(FFF_NUMBER);

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
