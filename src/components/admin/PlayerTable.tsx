"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, UserPlus, Search } from "lucide-react";
import type { Profile } from "@/types";

interface PlayerTableProps {
  onEdit: (player: Profile) => void;
  onAdd: () => void;
  refreshKey: number;
}

const roleLabels: Record<string, string> = {
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
};

export function PlayerTable({ onEdit, onAdd, refreshKey }: PlayerTableProps) {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const supabase = createClient();

    async function fetchPlayers() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .in("role", ["player", "parent", "coach"])
        .order("last_name", { ascending: true });

      setPlayers((data as Profile[]) || []);
      setLoading(false);
    }

    fetchPlayers();
  }, [refreshKey]);

  async function handleDeactivate(id: string) {
    if (!confirm("Désactiver ce joueur ?")) return;

    const res = await fetch(`/api/admin/players/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    }
  }

  const filtered = players.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      (p.position && p.position.toLowerCase().includes(q)) ||
      (p.shirt_number && p.shirt_number.toString().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un joueur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={onAdd}
          className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
        >
          <UserPlus className="h-4 w-4 mr-1" />
          Ajouter
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Joueur</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Rôle</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Poste</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">N°</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => (
                <tr
                  key={player.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={player.avatar_url || undefined} />
                        <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-xs font-bold">
                          {player.first_name[0]}
                          {player.last_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {player.first_name} {player.last_name}
                        </p>
                        {player.phone && (
                          <p className="text-xs text-muted-foreground">{player.phone}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <Badge variant="secondary" className="text-xs">
                      {roleLabels[player.role] || player.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    {player.position || "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell font-mono font-bold">
                    {player.shirt_number != null ? `#${player.shirt_number}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(player)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeactivate(player.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    Aucun joueur trouvé
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
