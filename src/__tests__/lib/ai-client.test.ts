/**
 * Tests — Service IA centralisé (src/lib/ai/client.ts)
 *
 * Périmètre :
 *   1. Nominal        : callAI retourne le contenu de la réponse OpenAI-compatible
 *   2. Config env     : OLLAMA_URL et AI_MODEL sont respectés
 *   3. JSON mode      : response_format envoyé quand responseFormat='json'
 *   4. Erreur réseau  : une erreur fetch est propagée
 *   5. Retry 500      : retry automatique sur erreur serveur (1 tentative)
 *   6. Timeout        : AbortSignal / timeout respecté dans les options fetch
 *
 * Hors-scope :
 *   - Tests d'intégration réseau réels (Ollama local / Vertex)
 *   - Streaming de réponses
 *   - Authentification / tokens API
 *
 * Phase "Red" attendue :
 *   - TOUS les tests DOIVENT ÉCHOUER — src/lib/ai/client.ts n'existe pas encore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Import du SUT (module à créer) ──────────────────────────────────────────

import { callAI } from "@/lib/ai/client";

// ─── Constantes ───────────────────────────────────────────────────────────────

const DEFAULT_URL = "http://localhost:11434/v1/chat/completions";
const DEFAULT_MODEL = "llama3";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Construit une réponse fetch simulant une réponse OpenAI-compatible. */
function makeOkResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/** Construit une réponse fetch avec un statut d'erreur serveur. */
function makeErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: "server error" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  // Repartir sur un fetch mock propre avant chaque test
  vi.spyOn(global, "fetch");

  // Rétablir les variables d'environnement par défaut
  delete process.env.OLLAMA_URL;
  delete process.env.AI_MODEL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. CAS NOMINAL
// ─────────────────────────────────────────────────────────────────────────────

describe("callAI — cas nominal", () => {
  it("retourne le contenu texte de la réponse IA", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(makeOkResponse("Hello world"));

    const result = await callAI("Tu es un assistant.", "Dis bonjour");

    expect(result).toBe("Hello world");
  });

  it("appelle fetch avec la bonne URL par défaut", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("system prompt", "user message");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(DEFAULT_URL);
  });

  it("envoie un body JSON avec model, messages et temperature", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("system", "user");

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body).toHaveProperty("model");
    expect(body).toHaveProperty("messages");
    expect(body).toHaveProperty("temperature");
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("construit le tableau messages avec un rôle system et un rôle user", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("Tu es un expert.", "Explique TDD");

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    const systemMsg = body.messages.find(
      (m: { role: string }) => m.role === "system"
    );
    const userMsg = body.messages.find(
      (m: { role: string }) => m.role === "user"
    );

    expect(systemMsg).toBeDefined();
    expect(systemMsg.content).toBe("Tu es un expert.");
    expect(userMsg).toBeDefined();
    expect(userMsg.content).toBe("Explique TDD");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CONFIGURATION VIA VARIABLES D'ENVIRONNEMENT
// ─────────────────────────────────────────────────────────────────────────────

describe("callAI — variables d'environnement", () => {
  it("utilise OLLAMA_URL quand la variable est définie", async () => {
    process.env.OLLAMA_URL = "http://custom:8080";

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("system", "user");

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain("http://custom:8080");
  });

  it("utilise AI_MODEL quand la variable est définie", async () => {
    process.env.AI_MODEL = "mistral:7b";

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("system", "user");

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.model).toBe("mistral:7b");
  });

  it("utilise le modèle par défaut quand AI_MODEL n'est pas défini", async () => {
    // S'assurer que AI_MODEL n'est pas défini
    delete process.env.AI_MODEL;

    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("system", "user");

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    // Le modèle ne doit pas être undefined ou vide
    expect(body.model).toBeTruthy();
    expect(typeof body.model).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. JSON MODE
// ─────────────────────────────────────────────────────────────────────────────

describe("callAI — mode JSON", () => {
  it("inclut response_format: { type: 'json_object' } quand responseFormat='json'", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse('{"result": "ok"}'));

    await callAI("system", "user", { responseFormat: "json" });

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("n'inclut pas response_format quand responseFormat n'est pas 'json'", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("plain text"));

    await callAI("system", "user");

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);

    expect(body.response_format).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GESTION D'ERREUR RÉSEAU
// ─────────────────────────────────────────────────────────────────────────────

describe("callAI — erreur réseau", () => {
  it("propage l'erreur si fetch throw (panne réseau)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      new Error("Network connection refused")
    );

    await expect(callAI("system", "user")).rejects.toThrow();
  });

  it("l'erreur propagée contient un message lisible", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(
      new Error("ECONNREFUSED")
    );

    await expect(callAI("system", "user")).rejects.toThrow(/Impossible de contacter|Ollama|OLLAMA_URL/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. RETRY SUR ERREUR 500
// ─────────────────────────────────────────────────────────────────────────────

describe("callAI — retry sur erreur serveur", () => {
  it("réessaie une fois après un 500 et retourne le succès du 2e appel", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeOkResponse("Retry succeeded"));

    const result = await callAI("system", "user");

    expect(result).toBe("Retry succeeded");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("propage l'erreur si les deux tentatives échouent avec 500", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(makeErrorResponse(500))
      .mockResolvedValueOnce(makeErrorResponse(500));

    await expect(callAI("system", "user")).rejects.toThrow();
  });

  it("ne retente pas sur une erreur 4xx (erreur client)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeErrorResponse(400));

    await expect(callAI("system", "user")).rejects.toThrow();

    // Erreur 4xx → pas de retry → 1 seul appel
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TIMEOUT
// ─────────────────────────────────────────────────────────────────────────────

describe("callAI — timeout", () => {
  it("passe un signal AbortController à fetch pour implémenter le timeout", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("system", "user");

    const [, options] = fetchSpy.mock.calls[0];
    // La requête doit inclure un AbortSignal pour le timeout
    expect((options as RequestInit).signal).toBeDefined();
  });

  it("accepte un paramètre timeout et l'applique", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(makeOkResponse("ok"));

    await callAI("system", "user", { timeout: 5000 });

    const [, options] = fetchSpy.mock.calls[0];
    // signal doit toujours être présent avec un timeout custom
    expect((options as RequestInit).signal).toBeDefined();
  });

  it("throw si le signal d'abort est déclenché (timeout expiré)", async () => {
    // Simuler un fetch qui throw avec AbortError (comportement natif browser/node)
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    vi.spyOn(global, "fetch").mockRejectedValue(abortError);

    await expect(callAI("system", "user", { timeout: 1 })).rejects.toThrow();
  });
});
