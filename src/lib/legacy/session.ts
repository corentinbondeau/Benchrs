/**
 * Résolution défensive du contexte legacy (utilisateur + équipe courante + rôle)
 * pour les handlers `/legacy/*`. Ne throw jamais : en cas d'erreur Supabase ou
 * d'absence de session/membership, renvoie `null` (ou un rôle "player" par
 * défaut si l'utilisateur est connecté mais sans équipe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LegacyRole } from "@/lib/legacy/nav";

export interface LegacyContext {
  userId: string;
  teamId: string | null;
  role: LegacyRole;
}

/**
 * Résout l'utilisateur courant, son équipe courante (1re membership) et son
 * rôle dans cette équipe. Retourne `null` si pas de session valide.
 */
export async function getLegacyContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<LegacyContext | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    try {
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id, role")
        .eq("user_id", user.id);

      const rows = (memberships ?? []) as Array<{ team_id: string; role: LegacyRole }>;

      if (rows.length === 0) {
        return { userId: user.id, teamId: null, role: "player" };
      }

      const first = rows[0];
      return { userId: user.id, teamId: first.team_id, role: first.role };
    } catch {
      return { userId: user.id, teamId: null, role: "player" };
    }
  } catch {
    return null;
  }
}
