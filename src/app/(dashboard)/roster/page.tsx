"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import Link from "next/link";
import { Shield, Users, Baby, ChevronRight } from "lucide-react";
import type { Profile } from "@/types";

const positionLabels: Record<string, string> = {
  goalkeeper: "Gardien",
  defender: "Défenseur",
  midfielder: "Milieu",
  forward: "Attaquant",
};

type Section = { key: "coach" | "player" | "parent"; label: string; icon: typeof Shield };

const SECTIONS: Section[] = [
  { key: "coach", label: "Coachs", icon: Shield },
  { key: "player", label: "Joueurs", icon: Users },
  { key: "parent", label: "Parents", icon: Baby },
];

export default function RosterPage() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();

    async function loadMembers() {
      const { data: rows } = await supabase
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", currentTeam!.id);

      if (!rows || rows.length === 0) {
        setAllProfiles([]);
        setLoading(false);
        return;
      }

      const roleMap: Record<string, string> = {};
      for (const r of rows) {
        roleMap[r.user_id] = r.role === "owner" ? "coach" : r.role;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", rows.map((r) => r.user_id))
        .order("last_name", { ascending: true });

      setAllProfiles(
        ((profiles as Profile[]) || []).map((p) => ({
          ...p,
          role: (roleMap[p.id] || p.role) as Profile["role"],
        }))
      );
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

  function RoleSection({ section }: { section: Section }) {
    const profiles = section.key === "coach" ? coaches : section.key === "player" ? players : parents;
    const Icon = section.icon;

    if (profiles.length === 0) return null;

    return (
      <div>
        <div className="flex items-center gap-2 px-4 pt-5 pb-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            {section.label}
          </h3>
          <span className="text-xs text-muted-foreground/60">({profiles.length})</span>
        </div>
        <div className="px-4 space-y-2">
          {profiles.map((profile) => {
            const initials = `${profile.first_name[0]}${profile.last_name[0]}`;
            const isPlayer = section.key === "player";
            return (
              <Link
                key={profile.id}
                href={`/stats/${profile.id}`}
                className="flex items-center gap-3 rounded-xl bg-card border p-4 active:scale-[0.98] transition-transform touch-manipulation"
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold shrink-0 ${
                    section.key === "coach"
                      ? "bg-amber-100 text-amber-700"
                      : isPlayer
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {isPlayer && profile.shirt_number
                    ? profile.shirt_number
                    : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px]">
                    {profile.first_name} {profile.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isPlayer
                      ? (positionLabels[profile.position || ""] || "Joueur")
                      : section.label.slice(0, -1)}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-xl font-bold">Effectif</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {allProfiles.length} membre{allProfiles.length > 1 ? "s" : ""}
        </p>
      </div>

      {allProfiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg">Aucun membre</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Invitez des joueurs via le code d&apos;invitation de l&apos;équipe.
          </p>
        </div>
      ) : (
        SECTIONS.map((section) => <RoleSection key={section.key} section={section} />)
      )}
    </div>
  );
}
