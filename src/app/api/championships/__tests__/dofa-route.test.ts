/**
 * Tests — Route POST /api/championships/dofa (modèle compétition, lot 4)
 *
 * Contexte (diagnostic établi) :
 *   Le vrai défaut logiciel n'est pas réseau : la route attrapait chaque
 *   erreur du client DOFA et renvoyait quand même un 200 avec un résultat
 *   vide, que l'UI interprétait comme "Aucune équipe trouvée pour ce club".
 *   Une panne d'infrastructure ne doit plus JAMAIS être présentée comme une
 *   absence de résultat métier.
 *
 * Contrat verrouillé ici (nouveau, lot 4 — modèle compétition) :
 *   1. L'entrée est le triplet { cpNo, phase, poule } (plus de fffNumber/eqNo).
 *   2. Si la source DOFA est injoignable (réseau) ou bloquée (403), la route
 *      répond 502 avec un message explicite mentionnant l'indisponibilité du
 *      service FFF — jamais un 200 avec une liste vide.
 *   3. Cas critique : une source injoignable ne doit produire AUCUNE réponse
 *      interprétable comme "aucun résultat" (pas de { matches: [] } en 200).
 *   4. Le comportement d'authentification/autorisation existant (401/403) est
 *      inchangé (régression de sécurité à proscrire).
 *   5. Un triplet absent/mal formé renvoie 400 (pas de 500/502).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock : @/lib/dofa — on contrôle les erreurs levées par le client
// ---------------------------------------------------------------------------
vi.mock("@/lib/dofa", () => ({
  fetchPouleResultats: vi.fn(),
  fetchPouleCalendrier: vi.fn(),
  fetchPouleClassement: vi.fn(),
  fetchPouleMatchs: vi.fn(),
  fetchPouleJournees: vi.fn(),
  fetchPoule: vi.fn(),
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
// Mock : @/lib/supabase/admin
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
  fetchPouleResultats,
  fetchPouleCalendrier,
  fetchPouleClassement,
  fetchPouleMatchs,
} from "@/lib/dofa";
import { getAuthUser, isTeamMember } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const POULE_REF = { cpNo: 457587, phase: 1, poule: 4 };

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
    vi.mocked(fetchPouleCalendrier).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchPouleResultats).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchPouleMatchs).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchPouleClassement).mockRejectedValue(new FakeDofaUnavailableError("network"));

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ ...POULE_REF, type: "calendar" }));

    const json = await res.json();

    expect(res.status, `attendu 502, reçu ${res.status} — body=${JSON.stringify(json)}`).toBe(502);
    expect(
      String(json.error ?? "").toLowerCase(),
      "le message doit mentionner l'indisponibilité du service FFF, de façon actionnable"
    ).toMatch(/fff|indisponible|service/);
  });

  it("répond 502 avec un message explicite quand la source DOFA renvoie 403 (blocage Akamai)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(fetchPouleClassement).mockRejectedValue(new FakeDofaUnavailableError("blocked", 403));

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ ...POULE_REF, type: "standings" }));

    const json = await res.json();

    expect(res.status, `attendu 502, reçu ${res.status} — body=${JSON.stringify(json)}`).toBe(502);
    expect(String(json.error ?? "").toLowerCase()).toMatch(/fff|indisponible|service/);
  });

  it("CAS CRITIQUE — ne renvoie jamais un 200 avec une liste vide quand la source est injoignable", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(fetchPouleMatchs).mockRejectedValue(new FakeDofaUnavailableError("network"));
    vi.mocked(fetchPouleClassement).mockRejectedValue(new FakeDofaUnavailableError("network"));

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ ...POULE_REF, type: "all" }));

    const json = await res.json();

    // La régression d'origine : status 200 + { matches: [] } interprété
    // comme "aucun résultat" plutôt que comme une panne.
    expect(
      res.status,
      `Régression du bug d'origine : une panne DOFA ne doit jamais produire un 200 (body=${JSON.stringify(json)})`
    ).not.toBe(200);

    if (res.status === 200) {
      expect(json).not.toEqual(expect.objectContaining({ matches: [] }));
    }
  });
});

describe("POST /api/championships/dofa — validation du triplet", () => {
  it("répond 400 si le triplet cpNo/phase/poule est absent", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ type: "calendar" }));

    expect(res.status).toBe(400);
  });

  it("répond 400 si un des trois champs du triplet n'est pas numérique", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ cpNo: "457587", phase: 1, poule: 4 }));

    expect(res.status).toBe(400);
  });
});

describe("POST /api/championships/dofa — sécurité inchangée (garde-fou anti-régression)", () => {
  it("répond 401 si l'appelant n'est pas authentifié", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest(POULE_REF));

    expect(res.status).toBe(401);
  });

  it("répond 403 si l'utilisateur authentifié n'a pas accès à l'équipe demandée (teamId)", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(makeAuthedUser());
    vi.mocked(isTeamMember).mockResolvedValue(false);

    const { POST } = await import("@/app/api/championships/dofa/route");
    const res = await POST(makeRequest({ teamId: "team-1", ...POULE_REF }));

    expect(res.status).toBe(403);
  });
});
