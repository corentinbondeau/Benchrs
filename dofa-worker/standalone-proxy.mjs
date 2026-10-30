#!/usr/bin/env node
/**
 * Micro-proxy DOFA standalone — VPS Scaleway.
 *
 * Usage : PORT=3456 node standalone-proxy.mjs
 * Test  : curl http://localhost:3456/api/clubs/10428
 */

import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT || "3456", 10);
const DOFA_BASE = process.env.DOFA_BASE || "https://api-dofa.fff.fr";
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

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, i * 1500));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: CHROME_HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ct = res.headers.get("content-type") || "";
      // 503/404 = API instable, retry
      if ((res.status === 503 || res.status === 404) && i < maxRetries - 1) continue;
      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (i === maxRetries - 1) throw err;
    }
  }
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || "*";
  const c = cors(origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204, c);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json", ...c });
    res.end('{"error":"GET only"}');
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname + url.search;

  if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
    res.writeHead(403, { "Content-Type": "application/json", ...c });
    res.end('{"error":"blocked"}');
    return;
  }

  try {
    const dofaRes = await fetchWithRetry(`${DOFA_BASE}${path}`);
    const ct = dofaRes.headers.get("content-type") || "";

    if (!dofaRes.ok || ct.includes("text/html")) {
      res.writeHead(502, { "Content-Type": "application/json", ...c });
      res.end(JSON.stringify({ error: `DOFA HTTP ${dofaRes.status}` }));
      return;
    }

    const body = await dofaRes.text();
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      ...c,
    });
    res.end(body);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json", ...c });
      res.end(JSON.stringify({ error: err.message || "Proxy error" }));
    }
  }
});

// Timeouts pour éviter les connexions fantômes
server.keepAliveTimeout = 30_000;
server.headersTimeout = 35_000;
server.requestTimeout = 60_000;

server.listen(PORT, () => {
  console.log(`DOFA proxy :${PORT} (retry=3, timeout=12s)`);
});
