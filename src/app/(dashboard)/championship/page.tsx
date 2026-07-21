"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Plus } from "lucide-react";
import { toast } from "sonner";

interface Championship {
  id: string;
  name: string;
  season: string;
  level: string | null;
  teams: ChampionshipTeam[];
}

interface ChampionshipTeam {
  id: string;
  team_name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
}

export default function ChampionshipPage() {
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", season: "2025-2026", level: "" });

  useEffect(() => {
    fetch("/api/championships")
      .then((r) => r.json())
      .then((data) => {
        setChampionships(data);
        if (data.length > 0) setSelectedId(data[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/championships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("Championnat cree");
      setCreateOpen(false);
      setForm({ name: "", season: "2025-2026", level: "" });
      const data = await fetch("/api/championships").then((r) => r.json());
      setChampionships(data);
    }
  }

  const selected = championships.find((c) => c.id === selectedId);
  const sortedTeams = selected
    ? [...selected.teams].sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against))
    : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Championnat</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Championnat</h2>
          <p className="text-muted-foreground mt-1">Classement et resultats</p>
        </div>
        {isCoach && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
              <Plus className="h-4 w-4 mr-1" />
              Championnat
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Creer un championnat</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Saison *</Label>
                    <Input value={form.season} onChange={(e) => setForm({ ...form, season: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Niveau</Label>
                    <Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold">Creer</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {championships.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Aucun championnat</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isCoach ? "Creez un championnat pour suivre les classements." : "Pas encore de championnat."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {championships.map((c) => (
              <Button key={c.id} variant={c.id === selectedId ? "secondary" : "outline"} size="sm" onClick={() => setSelectedId(c.id)} className="shrink-0">
                {c.name}
                <Badge variant="outline" className="ml-2 text-xs">{c.season}</Badge>
              </Button>
            ))}
          </div>

          {selected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Medal className="h-4 w-4" />
                  Classement - {selected.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedTeams.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    Aucune equipe dans le classement
                  </p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left">#</th>
                          <th className="p-2 text-left">Equipe</th>
                          <th className="p-2 text-center">J</th>
                          <th className="p-2 text-center">V</th>
                          <th className="p-2 text-center">N</th>
                          <th className="p-2 text-center">D</th>
                          <th className="p-2 text-center">BP</th>
                          <th className="p-2 text-center">BC</th>
                          <th className="p-2 text-center font-bold">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTeams.map((team, idx) => (
                          <tr key={team.id} className={`border-t ${idx === 0 ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                            <td className="p-2">{idx + 1}</td>
                            <td className="p-2 font-medium">{team.team_name}</td>
                            <td className="p-2 text-center">{team.played}</td>
                            <td className="p-2 text-center">{team.won}</td>
                            <td className="p-2 text-center">{team.drawn}</td>
                            <td className="p-2 text-center">{team.lost}</td>
                            <td className="p-2 text-center">{team.goals_for}</td>
                            <td className="p-2 text-center">{team.goals_against}</td>
                            <td className="p-2 text-center font-bold">{team.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
