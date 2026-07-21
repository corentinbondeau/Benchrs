"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Shield, Users, Baby } from "lucide-react";
import type { Profile } from "@/types";

const positionLabels: Record<string, string> = {
  goalkeeper: "Gardien",
  defender: "Defenseur",
  midfielder: "Milieu",
  forward: "Attaquant",
};

const roleLabels: Record<string, { label: string; color: string; icon: typeof Shield }> = {
  coach: { label: "Coachs", color: "text-amber-600", icon: Shield },
  player: { label: "Joueurs", color: "text-blue-600", icon: Users },
  parent: { label: "Parents", color: "text-green-600", icon: Baby },
};

export default function RosterPage() {
  const { user } = useAuth();
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("last_name", { ascending: true })
      .then(({ data }) => {
        setAllProfiles((data as Profile[]) || []);
        setLoading(false);
      });
  }, []);

  const coaches = allProfiles.filter((p) => p.role === "coach");
  const players = allProfiles.filter((p) => p.role === "player");
  const parents = allProfiles.filter((p) => p.role === "parent");

  const groupedByRole = [
    { key: "coach", profiles: coaches, ...roleLabels.coach },
    { key: "player", profiles: players, ...roleLabels.player },
    { key: "parent", profiles: parents, ...roleLabels.parent },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Effectif</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Effectif</h2>
        <p className="text-muted-foreground mt-1">
          {coaches.length} coach{coaches.length > 1 ? "s" : ""}, {players.length} joueur{players.length > 1 ? "s" : ""}, {parents.length} parent{parents.length > 1 ? "s" : ""}
        </p>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">Tous</TabsTrigger>
          {groupedByRole.filter(r => r.profiles.length > 0).map((role) => (
            <TabsTrigger key={role.key} value={role.key}>
              {role.label} ({role.profiles.length})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="all">
          <div className="space-y-6">
            {groupedByRole.map((role) => {
              if (role.profiles.length === 0) return null;
              const Icon = role.icon;
              return (
                <div key={role.key}>
                  <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${role.color}`}>
                    <Icon className="h-4 w-4" />
                    {role.label} ({role.profiles.length})
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {role.profiles.map((profile) => (
                      <ProfileCard key={profile.id} profile={profile} roleKey={role.key} />
                    ))}
                  </div>
                </div>
              );
            })}
            {allProfiles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold text-lg">Aucun membre</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  Les membres inscrits apparaitront ici.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {groupedByRole.map((role) => (
          <TabsContent key={role.key} value={role.key}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {role.profiles.map((profile) => (
                <ProfileCard key={profile.id} profile={profile} roleKey={role.key} />
              ))}
              {role.profiles.length === 0 && (
                <div className="col-span-full">
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-semibold text-lg">Aucun {role.label.toLowerCase().slice(0, -1)}</h3>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ProfileCard({ profile, roleKey }: { profile: Profile; roleKey: string }) {
  const roleColors: Record<string, string> = {
    coach: "bg-amber-100 text-amber-700",
    player: "bg-blue-100 text-blue-700",
    parent: "bg-green-100 text-green-700",
  };

  const roleBadgeLabels: Record<string, string> = {
    coach: "Coach",
    player: "Joueur",
    parent: "Parent",
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold ${
            roleKey === "coach" ? "bg-amber-100 text-amber-700" :
            roleKey === "player" ? "bg-blue-100 text-blue-700" :
            "bg-green-100 text-green-700"
          }`}>
            {roleKey === "player" && profile.shirt_number
              ? profile.shirt_number
              : `${profile.first_name[0]}${profile.last_name[0]}`
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">
              {profile.first_name} {profile.last_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {roleKey === "player"
                ? (positionLabels[profile.position || ""] || "Joueur")
                : roleBadgeLabels[roleKey] || roleKey
              }
            </p>
          </div>
          <Badge variant="secondary" className={`shrink-0 ${roleColors[roleKey]}`}>
            {roleBadgeLabels[roleKey]}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
