"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";

export interface UserClub {
  club_id: string;
  role: "comite" | null; // null = membre (familie/coach d'une équipe)
  name: string;
  logo_url: string | null;
}

/**
 * Clubs visibles par l'utilisateur :
 *   - clubs dont il est membre du comité (`club_members`, avec rôle), et
 *   - clubs de ses équipes (`team_members` → `teams.club_id`, rôle null).
 * Utilisé par les pages /club/* pour le sélecteur de club.
 */
export function useUserClubs() {
  const { user } = useAuth();
  const [clubs, setClubs] = useState<UserClub[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  const load = useCallback(async (uid: string) => {
    const [cmRes, tmRes] = await Promise.all([
      supabaseRef.current
        .from("club_members")
        .select("club_id, role, club:clubs(name, logo_url)")
        .eq("user_id", uid),
      supabaseRef.current
        .from("team_members")
        .select("team_id")
        .eq("user_id", uid),
    ]);

    const roles = new Map<string, "comite">();
    for (const r of (cmRes.data || []) as { club_id: string; role: string }[]) {
      if (r.role === "comite") {
        roles.set(r.club_id, r.role);
      }
    }

    const teamIds = (tmRes.data || []).map((m) => (m as { team_id: string }).team_id);
    let clubIdsFromTeams: string[] = [];
    if (teamIds.length > 0) {
      const { data: teams } = await supabaseRef.current
        .from("teams")
        .select("id, club_id")
        .in("id", teamIds);
      clubIdsFromTeams = [
        ...new Set(
          ((teams || []) as { club_id: string | null }[])
            .map((t) => t.club_id)
            .filter((c): c is string => Boolean(c))
        ),
      ];
    }
    const clubIds = [...new Set([...roles.keys(), ...clubIdsFromTeams])];
    if (clubIds.length === 0) return [];

    const { data: clubsData } = await supabaseRef.current
      .from("clubs")
      .select("id, name, logo_url")
      .in("id", clubIds)
      .order("name", { ascending: true });

    return ((clubsData || []) as { id: string; name: string; logo_url: string | null }[]).map(
      (c) => ({
        club_id: c.id,
        name: c.name,
        logo_url: c.logo_url,
        role: roles.get(c.id) ?? null,
      })
    );
  }, []);

  useEffect(() => {
    if (!user) return;
    load(user.id).then((res) => {
      setClubs(res);
      setLoading(false);
    });
  }, [user, load]);

  return { clubs, loading };
}