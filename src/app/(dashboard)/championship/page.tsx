"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trophy, Medal, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface Championship {
  id: string;
  name: string;
  season: string;
  level: string | null;
  teams: ChampionshipTeam[];
}

export default function ChampionshipPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const isCoach = session?.user?.role === "coach";
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [createForm, setCreateForm] = useState({ name: "", season: "2025-2026", level: "" });
  const [resultForm, setResultForm] = useState({
    matchday_number: "",
    home_team: "",
    away_team: "",
    home_score: "0",
    away_score: "0",
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/championships");
      if (res.ok && !cancelled) {
        const data = await res.json();
        setChampionships(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function refetch() {
    const res = await fetch("/api/championships");
    if (res.ok) {
      const data = await res.json();
      setChampionships(data);
    }
  }

  const selected = championships.find((c) => c.id === selectedId);
  const sortedTeams = selected
    ? [...selected.teams].sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against))
    : [];

  async function handleCreateChampionship(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/championships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    if (res.ok) {
      toast({ title: "Championnat créé" });
      setCreateOpen(false);
      setCreateForm({ name: "", season: "2025-2026", level: "" });
      refetch();
    }
  }

  async function handleAddResult(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/championships/standings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        championship_id: selectedId,
        matchday_number: resultForm.matchday_number ? parseInt(resultForm.matchday_number) : null,
        home_team: resultForm.home_team,
        away_team: resultForm.away_team,
        home_score: parseInt(resultForm.home_score),
        away_score: parseInt(resultForm.away_score),
      }),
    });
    if (res.ok) {
      toast({ title: "Résultat enregistré" });
      setResultOpen(false);
      setResultForm({ matchday_number: "", home_team: "", away_team: "", home_score: "0", away_score: "0" });
      refetch();
    }
  }

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
          <p className="text-muted-foreground mt-1">Classement et résultats</p>
        </div>
        <div className="flex gap-2">
          {isCoach && (
            <>
              <Dialog open={resultOpen} onOpenChange={setResultOpen}>
                <DialogTrigger render={<Button variant="outline" />}>
                  <Plus className="h-4 w-4 mr-1" />
                  Résultat
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Ajouter un résultat</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddResult} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Journée</Label>
                      <Input type="number" min="1" value={resultForm.matchday_number} onChange={(e) => setResultForm({ ...resultForm, matchday_number: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                      <div className="space-y-2">
                        <Label>Équipe à domicile</Label>
                        <Input value={resultForm.home_team} onChange={(e) => setResultForm({ ...resultForm, home_team: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Score</Label>
                        <div className="flex gap-1 items-center">
                          <Input type="number" min="0" className="w-14 text-center" value={resultForm.home_score} onChange={(e) => setResultForm({ ...resultForm, home_score: e.target.value })} />
                          <span className="text-muted-foreground">-</span>
                          <Input type="number" min="0" className="w-14 text-center" value={resultForm.away_score} onChange={(e) => setResultForm({ ...resultForm, away_score: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Équipe à l&apos;extérieur</Label>
                        <Input value={resultForm.away_team} onChange={(e) => setResultForm({ ...resultForm, away_team: e.target.value })} required />
                      </div>
                    </div>
                    <Button type="submit" className="w-full bg-[var(--gold)] text-[var(--gold-foreground)]" disabled={!resultForm.home_team || !resultForm.away_team}>
                      Enregistrer
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger render={<Button className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90" />}>
                  <Plus className="h-4 w-4 mr-1" />
                  Championnat
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Créer un championnat</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateChampionship} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nom *</Label>
                      <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Ex: Ligue U13" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Saison *</Label>
                        <Input value={createForm.season} onChange={(e) => setCreateForm({ ...createForm, season: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label>Niveau</Label>
                        <Input value={createForm.level} onChange={(e) => setCreateForm({ ...createForm, level: e.target.value })} placeholder="Ex: District" />
                      </div>
                    </div>
                    <Button type="submit" className="w-full bg-[var(--gold)] text-[var(--gold-foreground)]" disabled={!createForm.name}>
                      Créer
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {championships.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Aucun championnat</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Créez un championnat pour suivre les classements de votre équipe.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {championships.map((c) => (
              <Button
                key={c.id}
                variant={c.id === selectedId ? "secondary" : "outline"}
                size="sm"
                onClick={() => setSelectedId(c.id)}
                className="shrink-0"
              >
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
                  Classement — {selected.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedTeams.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    Aucune équipe dans le classement. Ajoutez des résultats pour commencer.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="py-2 pr-2 font-medium">#</th>
                          <th className="py-2 px-2 font-medium">Équipe</th>
                          <th className="py-2 px-2 text-center font-medium">J</th>
                          <th className="py-2 px-2 text-center font-medium">G</th>
                          <th className="py-2 px-2 text-center font-medium">N</th>
                          <th className="py-2 px-2 text-center font-medium">P</th>
                          <th className="py-2 px-2 text-center font-medium">BP</th>
                          <th className="py-2 px-2 text-center font-medium">BC</th>
                          <th className="py-2 px-2 text-center font-medium">+/−</th>
                          <th className="py-2 pl-2 text-center font-bold">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTeams.map((team, i) => (
                          <tr key={team.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="py-2.5 pr-2 font-medium">{i + 1}</td>
                            <td className="py-2.5 px-2 font-medium">{team.team_name}</td>
                            <td className="py-2.5 px-2 text-center text-muted-foreground">{team.played}</td>
                            <td className="py-2.5 px-2 text-center">{team.won}</td>
                            <td className="py-2.5 px-2 text-center">{team.drawn}</td>
                            <td className="py-2.5 px-2 text-center">{team.lost}</td>
                            <td className="py-2.5 px-2 text-center">{team.goals_for}</td>
                            <td className="py-2.5 px-2 text-center">{team.goals_against}</td>
                            <td className="py-2.5 px-2 text-center">
                              {team.goals_for - team.goals_against > 0 ? "+" : ""}
                              {team.goals_for - team.goals_against}
                            </td>
                            <td className="py-2.5 pl-2 text-center font-bold text-[var(--gold)]">{team.points}</td>
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
