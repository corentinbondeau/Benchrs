/**
 * Cloudflare Worker — proxy DOFA pour Benchrs.
 *
 * Relaie les requêtes vers l'API DOFA de la FFF avec les headers Chrome
 * nécessaires pour passer le WAF Akamai. Les IP Cloudflare ne sont pas
 * dans les blocklists datacenter AWS/GCP qu'Akamai utilise.
 *
 * Déployer : npx wrangler deploy
 * Tester  : npx wrangler dev
 *
 * Usage : GET https://<worker>.workers.dev/api/clubs/10428/equipes
 *         GET https://<worker>.workers.dev/api/clubs?cl_cod=525816
 *         GET https://<worker>.workers.dev/api/compets/457592/phases/1/poules/1/matchs
 */

const DOFA_BASE = "https://api-dofa.fff.fr";

const ALLOWED_PREFIXES = ["/api/clubs", "/api/compets/"];

const CHROME_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/ld+json, application/json",
  "Accept-Language": "fr-FR,fr;q=0.9",
  Origin: "https://www.fff.fr",
  Referer: "https://www.fff.fr/",
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "*";

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return Response.json(
        { error: "Only GET allowed" },
        { status: 405, headers: corsHeaders(origin) }
      );
    }

    const path = url.pathname;

    // Whitelist
    if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      return Response.json(
        { error: "Path not allowed" },
        { status: 403, headers: corsHeaders(origin) }
      );
    }

    // Relayer vers DOFA
    const dofaUrl = `${DOFA_BASE}${path}${url.search}`;

    try {
      const res = await fetch(dofaUrl, {
        method: "GET",
        headers: CHROME_HEADERS,
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok || contentType.includes("text/html")) {
        return Response.json(
          { error: `DOFA HTTP ${res.status}` },
          { status: 502, headers: corsHeaders(origin) }
        );
      }

      const data = await res.text();

      return new Response(data, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60",
          ...corsHeaders(origin),
        },
      });
    } catch (err) {
      return Response.json(
        { error: `Proxy error: ${err.message}` },
        { status: 502, headers: corsHeaders(origin) }
      );
    }
  },
};
