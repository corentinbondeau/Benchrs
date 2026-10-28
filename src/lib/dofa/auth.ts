let cached: { token: string; exp: number } | null = null;

export async function getDofaBearerToken(): Promise<string | null> {
  if (process.env.DOFA_BEARER_TOKEN) {
    return process.env.DOFA_BEARER_TOKEN;
  }

  if (cached && cached.exp > Date.now()) {
    return cached.token;
  }

  try {
    const res = await fetch("https://www.fff.fr/api/dofa/token", {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        Origin: "https://www.fff.fr",
        Referer: "https://www.fff.fr/",
      },
      cache: "no-store",
      redirect: "follow",
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok || contentType.includes("text/html")) {
      return null;
    }

    const data = await res.json().catch(() => ({}));
    const token =
      (typeof data?.token === "string" && data.token) ||
      (typeof data?.access_token === "string" && data.access_token) ||
      (typeof data?.jwt === "string" && data.jwt) ||
      (typeof data?.bearer === "string" && data.bearer) ||
      (typeof data?.data === "object" && data.data && typeof (data.data as any).token === "string" && (data.data as any).token);

    if (token) {
      cached = { token, exp: Date.now() + 45 * 60 * 1000 };
      return token;
    }
  } catch {
    // Ignorer et retomber sans token
  }

  return null;
}
