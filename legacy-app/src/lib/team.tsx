"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Team, TeamMemberRole } from "@/types";

export interface ClubMembership {
  club_id: string;
  role: "president" | "comite";
}

interface TeamContextType {
  currentTeam: Team | null;
  teams: Team[];
  userRole: TeamMemberRole | null;
  clubMemberships: ClubMembership[];
  switchTeam: (teamId: string) => void;
  loading: boolean;
  refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType>({
  currentTeam: null,
  teams: [],
  userRole: null,
  clubMemberships: [],
  switchTeam: () => {},
  loading: true,
  refreshTeams: async () => {},
});

export function useTeam() {
  return useContext(TeamContext);
}

function applyTeamColors(primary: string, secondary: string) {
  const root = document.documentElement;
  root.style.setProperty("--color-gold", primary);
  root.style.setProperty("--color-royal", secondary);
  root.style.setProperty("--color-navy", secondary);
}

function resetTeamColors() {
  const root = document.documentElement;
  root.style.setProperty("--color-gold", "#EAB308");
  root.style.setProperty("--color-royal", "#1E40AF");
  root.style.setProperty("--color-navy", "#0F172A");
}

const TEAM_CACHE_KEY = "team_cache";

interface TeamCache {
  teams: Team[];
  currentTeamId: string | null;
  userId: string;
}

function readTeamCache(userId: string): { teams: Team[]; currentTeam: Team | null } | null {
  try {
    const raw = localStorage.getItem(TEAM_CACHE_KEY);
    if (!raw) return null;
    const parsed: TeamCache = JSON.parse(raw);
    if (parsed.userId !== userId) return null;
    const currentTeam = parsed.teams.find((t) => t.id === parsed.currentTeamId) ?? parsed.teams[0] ?? null;
    return { teams: parsed.teams, currentTeam };
  } catch {
    return null;
  }
}

function writeTeamCache(userId: string, teams: Team[], currentTeam: Team | null) {
  try {
    const cache: TeamCache = {
      teams,
      currentTeamId: currentTeam?.id ?? null,
      userId,
    };
    localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore localStorage errors
  }
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: authUser, loading: authLoading } = useAuth();

  // Restauration synchrone depuis le cache : calculée une seule fois (ref de premier render)
  // On utilise useRef pour mémoriser le résultat sans re-déclencher le rendu
  const initRef = useRef<{ teams: Team[]; currentTeam: Team | null; loading: boolean } | null>(null);
  if (initRef.current === null) {
    if (authLoading || !authUser) {
      initRef.current = { teams: [], currentTeam: null, loading: authLoading ? true : false };
    } else {
      const cached = readTeamCache(authUser.id);
      initRef.current = cached
        ? { teams: cached.teams, currentTeam: cached.currentTeam, loading: false }
        : { teams: [], currentTeam: null, loading: true };
    }
  }
  const initialState = initRef.current;

  const [teams, setTeams] = useState<Team[]>(initialState.teams);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(initialState.currentTeam);
  const [userRole, setUserRole] = useState<TeamMemberRole | null>(null);
  const [clubMemberships, setClubMemberships] = useState<ClubMembership[]>([]);
  const [loading, setLoading] = useState(initialState.loading);
  const supabaseRef = useRef(createClient());

  const loadTeams = useCallback(async (userId: string) => {
    const supabase = supabaseRef.current;

    const { data: memberships, error } = await supabase
      .from("team_members")
      .select("team_id, role, team:teams(id, name, club_id, invite_code, color_primary, color_secondary, created_at, club:clubs(id, name, logo_url, created_by, created_at))")
      .eq("user_id", userId);

    if (error || !memberships) {
      console.error("[TeamProvider] failed to load teams:", error);
      setTeams([]);
      setCurrentTeam(null);
      setClubMemberships([]);
      setLoading(false);
      return;
    }

    const userTeams: Team[] = memberships
      .map((m) => {
        const raw = m.team as unknown as {
          id: string; name: string; club_id: string; invite_code: string;
          color_primary?: string | null; color_secondary?: string | null;
          created_at: string;
          club: { id: string; name: string; logo_url: string | null; created_by: string | null; created_at: string }[] | null;
        };
        if (!raw) return null;
        const team: Team = {
          id: raw.id,
          name: raw.name,
          club_id: raw.club_id,
          invite_code: raw.invite_code,
          color_primary: raw.color_primary || "#EAB308",
          color_secondary: raw.color_secondary || "#1E40AF",
          created_at: raw.created_at,
          club: Array.isArray(raw.club) ? raw.club[0] ?? undefined : (raw.club ?? undefined),
        };
        return team;
      })
      .filter(Boolean) as Team[];

    // Rôle comité/président : ajoute les équipes des clubs où l'on est membre du comité (lecture seule)
    // + les clubs que l'on a créés (créateur = président de facto, pas de ligne club_members).
    let clubTeams: Team[] = [];
    const [clubMembershipsRes, createdClubsRes] = await Promise.all([
      supabase
        .from("club_members")
        .select("club_id, role")
        .eq("user_id", userId),
      supabase.from("clubs").select("id").eq("created_by", userId),
    ]);
    const membershipsFromRows = ((clubMembershipsRes.data || []) as {
      club_id: string;
      role: "president" | "comite";
    }[]).map((c) => ({ club_id: c.club_id, role: c.role }));
    const createdClubs = ((createdClubsRes.data || []) as { id: string }[]).map(
      (c) => ({ club_id: c.id, role: "president" as const })
    );
    const clubMemberships = [
      ...membershipsFromRows,
      ...createdClubs.filter(
        (c) => !membershipsFromRows.some((m) => m.club_id === c.club_id)
      ),
    ];
    setClubMemberships(clubMemberships);
    if (clubMemberships.length) {
      const clubIds = clubMemberships.map((c) => c.club_id as string);
      const { data: cteams } = await supabase
        .from("teams")
        .select("id, name, club_id, invite_code, color_primary, color_secondary, created_at, club:clubs(id, name, logo_url, created_by, created_at)")
        .in("club_id", clubIds);
      clubTeams = ((cteams || []) as unknown as {
        id: string; name: string; club_id: string; invite_code: string;
        color_primary?: string | null; color_secondary?: string | null;
        created_at: string;
        club: { id: string; name: string; logo_url: string | null; created_by: string | null; created_at: string }[] | null;
      }[])
        .map((raw) => {
          const team: Team = {
            id: raw.id,
            name: raw.name,
            club_id: raw.club_id,
            invite_code: raw.invite_code,
            color_primary: raw.color_primary || "#EAB308",
            color_secondary: raw.color_secondary || "#1E40AF",
            created_at: raw.created_at,
            club: raw.club?.[0] ?? undefined,
          };
          return team;
        });
    }

    const merged = [...userTeams, ...clubTeams].filter(
      (team, index, arr) => arr.findIndex((t) => t.id === team.id) === index
    );

    setTeams(merged);

    const savedTeamId = localStorage.getItem("selectedTeamId");
    const team =
      merged.find((t) => t.id === savedTeamId) || merged[0] || null;

    if (team) {
      setCurrentTeam(team);
      applyTeamColors(team.color_primary, team.color_secondary);
      const membership = memberships.find((m) => m.team_id === team.id);
      setUserRole((membership?.role as TeamMemberRole) || null);
      localStorage.setItem("selectedTeamId", team.id);
    } else {
      setCurrentTeam(null);
      setUserRole(null);
      resetTeamColors();
      localStorage.removeItem("selectedTeamId");
    }

    // Écriture du cache après un chargement réseau réussi
    writeTeamCache(userId, merged, team);

    setLoading(false);
  }, []);

  const authUserId = authUser?.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (!authUserId) {
      setTeams([]);
      setCurrentTeam(null);
      setClubMemberships([]);
      setLoading(false);
      return;
    }
    loadTeams(authUserId);
  }, [authLoading, authUserId, loadTeams]);

  const switchTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (team) {
        setCurrentTeam(team);
        applyTeamColors(team.color_primary, team.color_secondary);
        localStorage.setItem("selectedTeamId", teamId);
        // Mise à jour du cache sans rechargement réseau
        if (authUserId) writeTeamCache(authUserId, teams, team);
      }
    },
    [teams, authUserId]
  );

  const refreshTeams = useCallback(async () => {
    if (authUserId) await loadTeams(authUserId);
  }, [authUserId, loadTeams]);

  const contextValue = useMemo(
    () => ({ currentTeam, teams, userRole, clubMemberships, switchTeam, loading, refreshTeams }),
    [currentTeam, teams, userRole, clubMemberships, switchTeam, loading, refreshTeams]
  );

  return (
    <TeamContext.Provider value={contextValue}>
      {children}
    </TeamContext.Provider>
  );
}
