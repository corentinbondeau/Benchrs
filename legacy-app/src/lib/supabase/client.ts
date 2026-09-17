import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function getSessionAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const expiresAt = session?.expires_at;
  // Token encore valide (marge de 30s) → on le renvoie tel quel.
  if (session && typeof expiresAt === "number" && expiresAt - 30 > Date.now() / 1000) {
    return session.access_token;
  }
  // Session absente OU token expiré/proche de l'expiration → on force un refresh.
  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token ?? null;
}
