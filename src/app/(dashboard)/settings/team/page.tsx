"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { TeamMember, Profile } from "@/types";

// ─── Lazy-loaded sections ─────────────────────────────────────────────────────

const TeamInfoSection = dynamic(() => import("./TeamInfoSection"), {
  ssr: false,
  loading: () => <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>,
});

const ColorsSection = dynamic(() => import("./ColorsSection"), {
  ssr: false,
  loading: () => null,
});

const LogoBannerSection = dynamic(() => import("./LogoBannerSection"), {
  ssr: false,
  loading: () => null,
});

const MembersSection = dynamic(() => import("./MembersSection"), {
  ssr: false,
  loading: () => <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>,
});

const DangerZoneSection = dynamic(() => import("./DangerZoneSection"), {
  ssr: false,
  loading: () => null,
});

// ─── Page principale ──────────────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const { currentTeam } = useTeam();
  const { user } = useAuth();
  const [members, setMembers] = useState<(TeamMember & { profile?: Profile })[]>([]);

  const fetchMembers = useCallback(async (teamId: string) => {
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId);
    if (!rows || rows.length === 0) return [];
    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, profile: profileMap.get(r.user_id) }));
  }, []);

  useEffect(() => {
    if (!currentTeam) return;
    fetchMembers(currentTeam.id).then(setMembers);
  }, [currentTeam, fetchMembers]);

  const isOwner = members.some(
    (m) => m.user_id === user?.id && m.role === "owner"
  );
  const { userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  if (!currentTeam) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Aucune équipe sélectionnée</p>
            <a
              href="/create-team"
              className="text-sm text-[var(--color-royal)] hover:underline mt-2 inline-block"
            >
              Créer une équipe
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto section-gap">
      <h1 className="text-2xl font-bold">Paramètres d&apos;équipe</h1>

      <TeamInfoSection isOwner={isOwner} isCoach={isCoach} />

      <ColorsSection isOwner={isOwner} />

      <LogoBannerSection isCoach={isCoach} />

      <MembersSection isOwner={isOwner} />

      <DangerZoneSection isOwner={isOwner} />
    </div>
  );
}
