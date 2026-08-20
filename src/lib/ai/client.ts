/**
 * Service IA centralisé — compatible Ollama, Mistral, OpenAI et tout
 * fournisseur exposant le endpoint POST /v1/chat/completions.
 *
 * Variables d'environnement :
 *   AI_BASE_URL : URL de base de l'API (défaut "https://api.mistral.ai")
 *                 — accepte aussi l'ancien nom OLLAMA_URL pour rétro-compatibilité
 *   AI_API_KEY  : clé d'API (Bearer token). Obligatoire pour Mistral/OpenAI,
 *                 ignorée pour Ollama local.
 *   AI_MODEL    : identifiant du modèle (défaut "mistral-small-latest")
 *
 * Retry : 1 retry automatique sur erreur serveur (>= 500), rate-limit (429)
 *         ou erreur réseau.
 * Timeout : AbortController (défaut 120 000 ms)
 */

export async function callAI(
  systemPrompt: string,
  userMessage: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: "json" | "text";
    timeout?: number;
  }
): Promise<string> {
  const baseUrl =
    process.env.AI_BASE_URL ||
    process.env.OLLAMA_URL ||
    "https://api.mistral.ai";
  const url = `${baseUrl}/v1/chat/completions`;
  const apiKey = process.env.AI_API_KEY || process.env.MISTRAL_API_KEY || "";
  const model = process.env.AI_MODEL || "mistral-small-latest";
  const temperature = options?.temperature ?? 0.7;
  const timeoutMs = options?.timeout ?? 120_000;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature,
    ...(options?.maxTokens !== undefined && { max_tokens: options.maxTokens }),
    ...(options?.responseFormat === "json" && {
      response_format: { type: "json_object" },
    }),
  };

  const doFetch = async (): Promise<string> => {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timerId);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw new Error(
          `Le serveur IA n'a pas répondu dans les ${Math.round(timeoutMs / 1000)}s. ` +
          `Vérifiez que le service est accessible sur ${baseUrl}.`
        );
      }
      throw new Error(
        `Impossible de contacter le serveur IA sur ${baseUrl}. ` +
        `Vérifiez AI_BASE_URL et que le service est accessible.`
      );
    } finally {
      clearTimeout(timerId);
    }

    if (!response.ok) {
      let detail = "";
      try { detail = ` — ${(await response.json()).error?.message || ""}`; } catch { /* ignore */ }
      const err = new Error(
        `AI request failed: HTTP ${response.status} ${response.statusText}${detail}`
      );
      (err as Error & { status: number }).status = response.status;
      throw err;
    }

    const data = await response.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;

    if (!content && content !== "") {
      throw new Error("AI response is empty or malformed");
    }

    return content;
  };

  // Attempt 1
  try {
    return await doFetch();
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    const message = (err as Error).message || "";
    // Retry on server error (>= 500), rate-limit (429), or network errors
    const isRetryableHttp = status !== undefined && (status >= 500 || status === 429);
    const isNetworkError = status === undefined && !message.includes("n'a pas répondu");
    if (isRetryableHttp || isNetworkError) {
      // Wait before retry — longer on rate-limit
      await new Promise((r) => setTimeout(r, status === 429 ? 5000 : 2000));
      return await doFetch();
    }
    throw err;
  }
}
