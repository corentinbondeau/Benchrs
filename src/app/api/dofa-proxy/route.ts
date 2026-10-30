import { NextResponse } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/api-auth";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * Proxy DOFA — relaye vers le VPS Scaleway (IP non bloquée par la FFF).
 * Vercel et tous les clouds (AWS, GCP, Cloudflare) sont bloqués par le WAF.
 * Seul le VPS Scaleway (IP hébergeur classique) passe.
 */
const SCALEWAY_PROXY = process.env.DOFA_PROXY_URL || "http://51.15.108.73:3456";

const ALLOWED_PREFIXES = ["/api/clubs", "/api/compets/"];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  if (!rateLimit(`dofa-proxy:${clientKey(req)}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Paramètre 'path' requis" }, { status: 400 });
  }

  const decodedPath = decodeURIComponent(path);
  if (!isAllowedPath(decodedPath)) {
    return NextResponse.json({ error: "Chemin non autorisé" }, { status: 403 });
  }

  const fullUrl = `${SCALEWAY_PROXY}${decodedPath}`;
  console.log(`[dofa-proxy] → ${fullUrl}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    const res = await fetch(fullUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") || "";
    console.log(`[dofa-proxy] ← HTTP ${res.status} (${contentType})`);
    if (!res.ok || contentType.includes("text/html")) {
      const body = await res.text().catch(() => "");
      console.log(`[dofa-proxy] error body: ${body.slice(0, 200)}`);
      let error = `L'API FFF a répondu HTTP ${res.status}. Réessayez plus tard.`;
      try { error = JSON.parse(body).error || error; } catch {}
      return NextResponse.json({ error }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dofa-proxy] failed:", msg);
    return NextResponse.json(
      { error: msg.includes("abort") ? "L'API FFF n'a pas répondu à temps. Réessayez." : "Impossible de contacter l'API FFF. Réessayez plus tard." },
      { status: 502 },
    );
  }
}
