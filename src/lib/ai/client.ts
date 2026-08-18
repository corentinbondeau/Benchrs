/**
 * Service IA centralisé — Ollama / OpenAI-compatible
 *
 * - URL   : OLLAMA_URL || "http://localhost:11434"
 * - Model : AI_MODEL  || "llama3.1:8b"
 * - Retry : 1 retry automatique sur erreur HTTP >= 500
 * - Timeout : AbortController (défaut 60 000 ms)
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
  const timeoutMs = options?.timeout ?? 60000;

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
    // Retry uniquement sur erreur serveur >= 500 (pas sur 4xx, ni AbortError)
    const status = (err as Error & { status?: number }).status;
    if (status !== undefined && status >= 500) {
      // Attempt 2 (unique retry)
      return await doFetch();
    }
    throw err;
  }
}
