"use client";

interface ErrorLog {
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  userAgent: string;
}

const logs: ErrorLog[] = [];

export function logClientError(error: Error) {
  const entry: ErrorLog = {
    message: error.message,
    stack: error.stack?.slice(0, 500),
    url: typeof window !== "undefined" ? window.location.href : "",
    timestamp: new Date().toISOString(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };
  logs.push(entry);
  console.error("[benchrs-error]", entry);
  // Futur : envoyer à un endpoint /api/logs ou Sentry
}

export function initErrorTracking() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    logClientError(e.error || new Error(e.message));
  });
  window.addEventListener("unhandledrejection", (e) => {
    logClientError(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
  });
}
