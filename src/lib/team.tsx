"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import type { Team, TeamMemberRole } from "@/types";

interface TeamContextType {
  currentTeam: Team | null;
  teams: Team[];
  userRole: TeamMemberRole | null;
  switchTeam: (teamId: string) => void;
  loading: boolean;
  refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType>({
  currentTeam: null,
  teams: [],
  userRole: null,
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

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user: authUser, loading: authLoading } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [userRole, setUserRole] = useState<TeamMemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());

  const loadTeams = useCallback(async (userId: string) => {
    const supabase = supabaseRef.current;

    const { data: memberships, error } = await supabase
      .from("team_members")
      .select("team_id, role, team:teams(id, name, club_id, invite_code, created_at, club:clubs(id, name, logo_url, created_by, created_at))")
      .eq("user_id", userId);

    if (error || !memberships) {
      console.error("[TeamProvider] failed to load teams:", error);
      setTeams([]);
      setCurrentTeam(null);
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
          club: raw.club?.[0] ?? undefined,
        };
        return team;
      })
      .filter(Boolean) as Team[];

    setTeams(userTeams);

    const savedTeamId = localStorage.getItem("selectedTeamId");
    const team =
      userTeams.find((t) => t.id === savedTeamId) || userTeams[0] || null;

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

    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setTeams([]);
      setCurrentTeam(null);
      setLoading(false);
      return;
    }
    loadTeams(authUser.id);
  }, [authLoading, authUser, loadTeams]);

  const switchTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (team) {
        setCurrentTeam(team);
        applyTeamColors(team.color_primary, team.color_secondary);
        localStorage.setItem("selectedTeamId", teamId);
        if (authUser) loadTeams(authUser.id);
      }
    },
    [teams, loadTeams, authUser]
  );

  const refreshTeams = useCallback(async () => {
    if (authUser) await loadTeams(authUser.id);
  }, [authUser, loadTeams]);

  return (
    <TeamContext.Provider
      value={{
        currentTeam,
        teams,
        userRole,
        switchTeam,
        loading,
        refreshTeams,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}
