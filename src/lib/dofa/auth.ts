let cached: { token: string; exp: number } | null = null;

export async function getDofaBearerToken(): Promise<string | null> {
  if (cached && cached.exp > Date.now()) {
    return cached.token;
  }

  try {
    const res = await fetch("https://www.fff.fr/api/dofa/token", {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Benchrs)",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json().catch(() => ({}));
    const token =
      (typeof data?.token === "string" && data.token) ||
      (typeof data?.access_token === "string" && data.access_token) ||
      (typeof data?.jwt === "string" && data.jwt) ||
      (typeof data?.bearer === "string" && data.bearer);

    if (token) {
      cached = { token, exp: Date.now() + 45 * 60 * 1000 };
      return token;
    }
  } catch {
    // Ignorer et retomber sans token (fallback)
  }

  return null;
}
