#!/usr/bin/env node
/**
 * Micro-proxy DOFA standalone — à déployer sur un VPS (Oracle Cloud, etc.)
 *
 * Usage :
 *   PORT=3456 node standalone-proxy.mjs
 *   # ou via Docker / PM2 / systemd
 *
 * Teste :
 *   curl http://localhost:3456/api/clubs/10428
 *
 * Depuis Benchrs :
 *   NEXT_PUBLIC_DOFA_WORKER_URL=https://mon-vps.example.com:3456
 */

import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT || "3456", 10);
const DOFA_BASE = process.env.DOFA_BASE || "https://api-dofa.fff.fr";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*").split(",");

const ALLOWED_PREFIXES = ["/api/clubs", "/api/compets/"];

const CHROME_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/ld+json, application/json",
  "Accept-Language": "fr-FR,fr;q=0.9",
  "Accept-Encoding": "identity",
  Origin: "https://www.fff.fr",
  Referer: "https://www.fff.fr/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "Sec-Ch-Ua": '"Chromium";v="130", "Google Chrome";v="130"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
};

function corsHeaders(origin) {
  const allowed =
    ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin || "*" : "",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || "*";
  const cors = corsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "Only GET allowed" }));
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname + url.search;

  if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
    res.writeHead(403, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: "Path not allowed" }));
    return;
  }

  try {
    const dofaUrl = `${DOFA_BASE}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const dofaRes = await fetch(dofaUrl, {
      method: "GET",
      headers: CHROME_HEADERS,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const contentType = dofaRes.headers.get("content-type") || "";

    if (!dofaRes.ok || contentType.includes("text/html")) {
      res.writeHead(502, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ error: `DOFA HTTP ${dofaRes.status}` }));
      return;
    }

    const body = await dofaRes.text();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...cors,
    });
    res.end(body);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ error: err.message || "Proxy error" }));
  }
});

server.listen(PORT, () => {
  console.log(`DOFA proxy listening on :${PORT}`);
  console.log(`Test: curl http://localhost:${PORT}/api/clubs/10428`);
});
