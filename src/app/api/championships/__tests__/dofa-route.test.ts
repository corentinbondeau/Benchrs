/**
 * Tests TDD — Route POST /api/championships/dofa (Phase RED)
 *
 * Contexte (diagnostic établi) :
 *   Le vrai défaut logiciel n'est pas réseau : la route attrapait chaque
 *   erreur du client DOFA et renvoyait quand même un 200 avec un résultat
 *   vide, que l'UI interprétait comme "Aucune équipe trouvée pour ce club".
 *   Une panne d'infrastructure ne doit plus JAMAIS être présentée comme une
 *   absence de résultat métier.
 *
 * Contrat verrouillé ici :
 *   1. Si la source DOFA est injoignable (réseau) ou bloquée (403), la route
 *      répond 502 avec un message explicite mentionnant l'indisponibilité du
 *      service FFF — jamais un 200 avec une liste vide.
 *   2. Cas critique : une source injoignable ne doit produire AUCUNE réponse
 *      interprétable comme "aucun résultat" (pas de { equipes: [] } en 200).
 *   3. Le comportement d'authentification/autorisation existant (401/403) est
 *      inchangé (régression de sécurité à proscrire).
 *
 * Style aligné sur src/app/api/notifications/__tests__/cron-order.test.ts :
 *   mocks vi.mock() en tête de fichier, import du SUT après les mocks,
 *   construction de Request minimaliste, assertions sur status + corps JSON.
 *
 * Phase "Red" attendue :
 *   - Les tests 502/message explicite DOIVENT ÉCHOUER : la route actuelle
 *     avale les erreurs et répond 200 avec un objet vide (pas de reason
 *     "unavailable" typée, pas de status 502 pour une panne DOFA).
 *   - Les tests d'authentification/autorisation, eux, protègent un
 *     comportement déjà correct et doivent rester verts (garde-fou anti-
 *     régression, pas un ajout de fonctionnalité).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock : @/lib/dofa — on contrôle les erreurs levées par le client
// ---------------------------------------------------------------------------
vi.mock("@/lib/dofa", () => ({
  fetchClubEquipes: vi.fn(),
  fetchCalendrier: vi.fn(),
  fetchResultats: vi.fn(),
  fetchClassement: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock : @/lib/api-auth
// ---------------------------------------------------------------------------
vi.mock("@/lib/api-auth", () => ({
  getAuthUser: vi.fn(),
  unauthorized: vi.fn(
    () =>
      new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
  ),
  forbidden: vi.fn(
    () =>
      new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
  ),
  isTeamMember: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock : @/lib/supabase/admin (non utilisé quand fffNumber est fourni directement)
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null }),
        }),
      }),
    }),
  })),
}));

import {
  fetchClubEquipes,
  fetchCalendrier,
  fetchResultats,
  fetchClassement,
} from "@/lib/dofa";
import { getAuthUser } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FFF_NUMBER = "525816";
const EQ_NO = "525816A";

function makeAuthedUser() {
  return { id: "user-1" } as never;
}

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/championships/dofa", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Simule l'erreur typée que le client DOFA doit lever (contrat verrouillé côté client.test.ts). */
class FakeDofaUnavailableError extends Error {
  readonly reason: "network" | "blocked" | "http";
  readonly status?: number;
  constructor(reason: "network" | "blocked" | "http", status?: number) {
    super(`DOFA unavailable: ${reason}`);
    this.reason = reason;
    this.status = status;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/championships/dofa — panne infrastructure explicite (502)", () => {
  it("répond 502 avec un message explicite quand la source DOFA est injoignable (réseau)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(fetchClubEquipes).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchCalendrier).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchResultats).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchClassement).mockRejectedValue(new FakeDofaUnavailableError("network"));

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ fffNumber: FFF_NUMBER, eqNo: EQ_NO, type: "calendar" }));

    const json = await res.json();

    expect(res.status, `attendu 502, reçu ${res.status} — body=${JSON.stringify(json)}`).toBe(502);
    expect(
      String(json.error ?? "").toLowerCase(),
      "le message doit mentionner l'indisponibilité du service FFF, de façon actionnable"
    ).toMatch(/fff|indisponible|service/);
  });

  it("répond 502 avec un message explicite quand la source DOFA renvoie 403 (blocage Akamai)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(fetchClubEquipes).mockRejectedValue(new FakeDofaUnavailableError("blocked", 403));
    vi.mocked(fetchCalendrier).mockRejectedValue(new FakeDofaUnavailableError("blocked", 403));
    vi.mocked(fetchResultats).mockRejectedValue(new FakeDofaUnavailableError("blocked", 403));
    vi.mocked(fetchClassement).mockRejectedValue(new FakeDofaUnavailableError("blocked", 403));

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ fffNumber: FFF_NUMBER, eqNo: EQ_NO, type: "standings" }));

    const json = await res.json();

    expect(res.status, `attendu 502, reçu ${res.status} — body=${JSON.stringify(json)}`).toBe(502);
    expect(String(json.error ?? "").toLowerCase()).toMatch(/fff|indisponible|service/);
  });

  it("CAS CRITIQUE — ne renvoie jamais un 200 avec une liste vide quand la source est injoignable", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(fetchClubEquipes).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchCalendrier).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchResultats).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchClassement).mockRejectedValue(new FakeDofaUnavailableError("network"));

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ fffNumber: FFF_NUMBER, eqNo: EQ_NO, type: "all" }));

    const json = await res.json();

    // La régression d'origine : status 200 + { equipes: [] } / { matches: [] }
    // interprété comme "aucun résultat" plutôt que comme une panne.
    expect(
      res.status,
      `Régression du bug d'origine : une panne DOFA ne doit jamais produire un 200 (body=${JSON.stringify(json)})`
    ).not.toBe(200);

    if (res.status === 200) {
      expect(json).not.toEqual(
        expect.objectContaining({ equipes: expect.arrayContaining([]) })
      );
    }
  });
});

describe("POST /api/championships/dofa — sécurité inchangée (garde-fou anti-régression)", () => {
  it("répond 401 si l'appelant n'est pas authentifié", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ fffNumber: FFF_NUMBER }));

    expect(res.status).toBe(401);
  });

  it("répond 403 si l'utilisateur authentifié n'a pas accès à l'équipe demandée (teamId)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    const { isTeamMember } = await import("@/lib/api-auth");
    vi.mocked(isTeamMember).mockResolvedValue(false);

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ teamId: "team-1" }));

    expect(res.status).toBe(403);
  });
});
