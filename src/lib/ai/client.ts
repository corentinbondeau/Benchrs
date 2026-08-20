/**
 * Service IA centralisé — Ollama / OpenAI-compatible
 *
 * - URL   : OLLAMA_URL || "http://localhost:11434"
 * - Model : AI_MODEL  || "llama3.1:8b"
 * - Retry : 1 retry automatique sur erreur serveur (>= 500) ou erreur réseau
 * - Timeout : AbortController (défaut 120 000 ms)
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
  const baseUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const url = `${baseUrl}/v1/chat/completions`;
  const model = process.env.AI_MODEL || "llama3.1:8b";
  const temperature = options?.temperature ?? 0.7;
  const timeoutMs = options?.timeout ?? 120_000;

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timerId);
      // Enhance network-level errors with actionable context
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw new Error(
          `Le serveur IA n'a pas répondu dans les ${Math.round(timeoutMs / 1000)}s. ` +
          `Vérifiez qu'Ollama est lancé (ollama serve) et accessible sur ${baseUrl}.`
        );
      }
      throw new Error(
        `Impossible de contacter le serveur IA sur ${baseUrl}. ` +
        `Vérifiez qu'Ollama est lancé (ollama serve) et que OLLAMA_URL est correctement configuré.`
      );
    } finally {
      clearTimeout(timerId);
    }

    if (!response.ok) {
      const err = new Error(
        `AI request failed: HTTP ${response.status} ${response.statusText}`
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
    // Retry on server error (>= 500) or network/connection errors (not on 4xx or abort/timeout)
    const isNetworkError = status === undefined && !message.includes("n'a pas répondu");
    if ((status !== undefined && status >= 500) || isNetworkError) {
      // Attempt 2 (unique retry) — wait 2s for Ollama cold start
      await new Promise((r) => setTimeout(r, 2000));
      return await doFetch();
    }
    throw err;
  }
}
