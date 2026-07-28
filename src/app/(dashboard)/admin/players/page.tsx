"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserCog, Check, X } from "lucide-react";
import type { Profile } from "@/types";

export default function AdminPlayersPage() {
  const { currentTeam } = useTeam();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  function fetchPlayers() {
    const supabase = createClient();
    supabase
      .from("team_members")
      .select("user_id, role")
      .eq("team_id", currentTeam!.id)
      .then(async ({ data: members }) => {
        if (!members || members.length === 0) {
          setPlayers([]);
          setLoading(false);
          return;
        }
        const userIds = members.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds)
          .order("last_name", { ascending: true });
        if (!profiles) {
          setPlayers([]);
          setLoading(false);
          return;
        }
        const roleMap = Object.fromEntries(members.map((m) => [m.user_id, m.role]));
        setPlayers(profiles.map((p) => ({ ...p, role: roleMap[p.id] ?? p.role })));
        setLoading(false);
      });
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l'équipe...</p></div>;
  }

  useEffect(() => { fetchPlayers(); }, []);

  async function toggleActive(id: string, current: boolean) {
    const supabase = createClient();
    await supabase.from("profiles").update({ is_active: !current }).eq("id", id);
    fetchPlayers();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Gestion des joueurs</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Gestion des joueurs</h2>
        <p className="text-muted-foreground mt-1">{players.length} membre{players.length > 1 ? "s" : ""}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Tous les membres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {players.map((player) => (
              <div key={player.id} className={`flex items-center justify-between rounded-lg border p-3 ${!player.is_active ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                    {player.first_name[0]}{player.last_name[0]}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{player.first_name} {player.last_name}</p>
                    <p className="text-xs text-muted-foreground">{player.role === "player" ? "Joueur" : "Parent"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={player.is_active ? "default" : "secondary"}>
                    {player.is_active ? "Actif" : "Inactif"}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleActive(player.id, player.is_active)}>
                    {player.is_active ? <X className="h-4 w-4 text-red-500" /> : <Check className="h-4 w-4 text-green-500" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
