import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 60 || key.includes("CHANGEME")) {
    console.error(
      "[admin] SUPABASE_SERVICE_ROLE_KEY est invalide (placeholder/stub). " +
        "Toutes les routes serveur protégées (getAuthUser, notifications, convocations, cron) " +
        "renvoient 401. Mettre la vraie clé service_role (Supabase > Settings > API) dans l'env Vercel."
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
