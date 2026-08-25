"use client";

import { getSessionAccessToken } from "@/lib/supabase/client";

export async function authFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const token = await getSessionAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
