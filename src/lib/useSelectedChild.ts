"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";

export interface ChildInfo {
  id: string;
  first_name: string;
  last_name: string;
}

const STORAGE_KEY = (teamId: string) => `selectedChild:${teamId}`;

/**
 * Enfants d'un parent dans une équipe + sélection persistée par équipe (localStorage).
 * Fiable avec plusieurs enfants : getParentChildId (maybeSingle) échouait dès 2 enfants.
 */
export function useSelectedChild(teamId: string | undefined) {
  const { user } = useAuth();
  const [children, setChildren] = useState<ChildInfo[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadChildren = useCallback(
    async (userId: string, tid: string): Promise<ChildInfo[]> => {
      const supabase = createClient();
      const { data } = await supabase
        .from("parent_student")
        .select("student_id")
        .eq("parent_id", userId)
        .eq("team_id", tid);
      const ids = (data || []).map((r) => (r as { student_id: string }).student_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", ids);
      return (profiles as ChildInfo[]) || [];
    },
    []
  );

  useEffect(() => {
    if (!user?.id || !teamId) return;
    let cancelled = false;
    loadChildren(user.id, teamId).then((kids) => {
      if (cancelled) return;
      setChildren(kids);
      const saved = localStorage.getItem(STORAGE_KEY(teamId));
      const first = kids[0]?.id ?? null;
      setSelectedChildId(kids.some((k) => k.id === saved) ? saved : first);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, teamId, loadChildren]);

  const setChild = useCallback(
    (id: string) => {
      setSelectedChildId(id);
      if (teamId) localStorage.setItem(STORAGE_KEY(teamId), id);
    },
    [teamId]
  );

  return { children, selectedChildId, setChild, loading };
}
