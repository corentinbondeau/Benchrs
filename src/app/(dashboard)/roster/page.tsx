"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { UserPlus, Shield, Users, Baby, ChevronRight } from "lucide-react";
import type { Profile } from "@/types";

const positionLabels: Record<string, string> = {
  goalkeeper: "Gardien",
  defender: "Défenseur",
  midfielder: "Milieu",
  forward: "Attaquant",
};

const ROLE_TABS = [
  { key: "all", label: "Tous", icon: Users },
  { key: "coach", label: "Coachs", icon: Shield },
  { key: "player", label: "Joueurs", icon: Users },
  { key: "parent", label: "Parents", icon: Baby },
] as const;

export default function RosterPage() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState("all");

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();

    async function loadMembers() {
      const { data: rows } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", currentTeam!.id);

      if (!rows || rows.length === 0) {
        setAllProfiles([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", rows.map((r) => r.user_id))
        .order("last_name", { ascending: true });

      setAllProfiles((profiles as Profile[]) || []);
      setLoading(false);
    }

    loadMembers();
  }, [currentTeam?.id]);

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  const coaches = allProfiles.filter((p) => p.role === "coach");
  const players = allProfiles.filter((p) => p.role === "player");
  const parents = allProfiles.filter((p) => p.role === "parent");

  const roleMap: Record<string, Profile[]> = {
    all: allProfiles,
    coach: coaches,
    player: players,
    parent: parents,
  };

  const filteredProfiles = roleMap[activeRole] || [];

  const roleCounts: Record<string, number> = {
    all: allProfiles.length,
    coach: coaches.length,
    player: players.length,
    parent: parents.length,
  };

  if (loading) {
    return (
      <div className="p-4 pb-24">
        <h2 className="text-xl font-bold mb-6">Effectif</h2>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xl font-bold">Effectif</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {coaches.length > 0 && `${coaches.length} coach${coaches.length > 1 ? "s" : ""}`}
          {coaches.length > 0 && players.length > 0 && " · "}
          {players.length > 0 && `${players.length} joueur${players.length > 1 ? "s" : ""}`}
          {((coaches.length > 0 || players.length > 0) && parents.length > 0) && " · "}
          {parents.length > 0 && `${parents.length} parent${parents.length > 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Role filter chips */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-none">
        {ROLE_TABS.map((tab) => {
          const count = roleCounts[tab.key];
          const isActive = activeRole === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveRole(tab.key)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors touch-manipulation ${
                isActive
                  ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Player list */}
      <div className="px-4 space-y-2">
        {filteredProfiles.map((profile) => {
          const roleKey = profile.role || "player";
          const initials = `${profile.first_name[0]}${profile.last_name[0]}`;
          const roleBadgeLabels: Record<string, string> = {
            coach: "Coach",
            player: "Joueur",
            parent: "Parent",
          };

          return (
            <div
              key={profile.id}
              className="flex items-center gap-3 rounded-xl bg-card border p-4 active:scale-[0.98] transition-transform touch-manipulation"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold shrink-0 ${
                  roleKey === "coach"
                    ? "bg-amber-100 text-amber-700"
                    : roleKey === "player"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {roleKey === "player" && profile.shirt_number
                  ? profile.shirt_number
                  : initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[15px]">
                  {profile.first_name} {profile.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {roleKey === "player"
                    ? (positionLabels[profile.position || ""] || "Joueur")
                    : roleBadgeLabels[roleKey]}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground/40 shrink-0" />
            </div>
          );
        })}

        {filteredProfiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Aucun membre</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Les membres inscrits apparaitront ici.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
