"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
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

export function TeamProvider({ children }: { children: ReactNode }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null);
  const [userRole, setUserRole] = useState<TeamMemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadTeams = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setTeams([]);
      setCurrentTeam(null);
      setLoading(false);
      return;
    }

    const { data: memberships } = await supabase
      .from("team_members")
      .select("team_id, role, team:teams(id, name, club_id, invite_code, created_at, club:clubs(id, name, logo_url, created_by, created_at))")
      .eq("user_id", user.id);

    if (!memberships) {
      setTeams([]);
      setCurrentTeam(null);
      setLoading(false);
      return;
    }

    const userTeams: Team[] = memberships
      .map((m) => {
        const raw = m.team as unknown as { id: string; name: string; club_id: string; invite_code: string; created_at: string; club: { id: string; name: string; logo_url: string | null; created_by: string | null; created_at: string }[] | null };
        if (!raw) return null;
        const team: Team = {
          id: raw.id,
          name: raw.name,
          club_id: raw.club_id,
          invite_code: raw.invite_code,
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
      const membership = memberships.find((m) => m.team_id === team.id);
      setUserRole((membership?.role as TeamMemberRole) || null);
      localStorage.setItem("selectedTeamId", team.id);
    } else {
      setCurrentTeam(null);
      setUserRole(null);
      localStorage.removeItem("selectedTeamId");
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const switchTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (team) {
        setCurrentTeam(team);
        localStorage.setItem("selectedTeamId", teamId);
        // Reload to get the correct role
        loadTeams();
      }
    },
    [teams, loadTeams]
  );

  return (
    <TeamContext.Provider
      value={{
        currentTeam,
        teams,
        userRole,
        switchTeam,
        loading,
        refreshTeams: loadTeams,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}
