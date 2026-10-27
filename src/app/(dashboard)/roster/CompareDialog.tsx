"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTeam } from "@/lib/team";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { Profile } from "@/types";

type PlayerStats = {
  id: string;
  name: string;
  goals: number;
  assists: number;
  matches: number;
  minutes: number;
  presence: number;
};

export function CompareDialog({ open, onOpenChange, profiles }: { open: boolean; onOpenChange: (open: boolean) => void; profiles: Profile[] }) {
  const { currentTeam } = useTeam();
  const [players, setPlayers] = useState<PlayerStats[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const playerList = profiles.filter(p => p.role === "player");

  useEffect(() => {
    if (!open || !currentTeam) return;
    setLoading(true);
    const supabase = createClient();
    async function load() {
      const { data: stats } = await supabase
        .from("match_stats")
        .select("player_id, goals, assists, minutes_played, matches_played")
        .eq("team_id", currentTeam!.id);
      
      const map = new Map<string, PlayerStats>();
      for (const p of playerList) {
        map.set(p.id, { id: p.id, name: `${p.first_name} ${p.last_name}`, goals: 0, assists: 0, matches: 0, minutes: 0, presence: 0 });
      }
      for (const s of (stats || []) as any[]) {
        if (map.has(s.player_id)) {
          const m = map.get(s.player_id)!;
          m.goals += s.goals || 0;
          m.assists += s.assists || 0;
          m.matches += s.matches_played || 0;
          m.minutes += s.minutes_played || 0;
        }
      }
      setPlayers(Array.from(map.values()));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentTeam?.id]);

  const selectedData = players.filter(p => selected.includes(p.id));
  const chartData = selectedData.map(p => ({
    name: p.name.split(" ")[0],
    Buts: p.goals,
    Passes: p.assists,
    Matchs: p.matches,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comparer les joueurs</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {playerList.map(p => {
              const id = p.id;
              const active = selected.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => setSelected(prev => active ? prev.filter(x=>x!==id) : [...prev, id].slice(0, 4))}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition ${active ? "bg-[var(--color-primary-blue)] text-white border-transparent" : "bg-background"}`}
                >
                  {p.first_name} {p.last_name}
                </button>
              );
            })}
          </div>
          {loading && <p className="text-sm text-muted-foreground">Chargement...</p>}
          {!loading && selectedData.length > 0 && (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Buts" fill="#22c55e" />
                  <Bar dataKey="Passes" fill="#3b82f6" />
                  <Bar dataKey="Matchs" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {!loading && selected.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Sélectionnez jusqu'à 4 joueurs à comparer</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
