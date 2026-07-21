"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Plus, Download, Loader2 } from "lucide-react";
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

interface ScrapedTeam {
  team_name: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
}

export default function ChampionshipPage() {
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", season: "2025-2026", level: "" });

  const [fffOpen, setFffOpen] = useState(false);
  const [fffUrl, setFffUrl] = useState("");
  const [fffHtml, setFffHtml] = useState("");
  const [fffLoading, setFffLoading] = useState(false);
  const [scrapedTeams, setScrapedTeams] = useState<ScrapedTeam[] | null>(null);
  const [importName, setImportName] = useState("");
  const [importSeason, setImportSeason] = useState("2025-2026");
  const [importLevel, setImportLevel] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function handleFffScrape() {
    if (!fffUrl && !fffHtml) {
      toast.error("Entrez une URL ou collez le HTML");
      return;
    }
    setFffLoading(true);
    setScrapedTeams(null);
    try {
      const res = await fetch("/api/championships/fff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fffUrl || undefined, html: fffHtml || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors du scraping");
        return;
      }
      setScrapedTeams(data.teams);
      toast.success(`${data.teams.length} equipes importees`);
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setFffLoading(false);
    }
  }

  async function handleFffSave() {
    if (!scrapedTeams || scrapedTeams.length === 0) return;
    if (!importName.trim()) {
      toast.error("Entrez un nom de championnat");
      return;
    }
    setSaving(true);
    try {
      const createRes = await fetch("/api/championships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importName.trim(),
          season: importSeason,
          level: importLevel || null,
        }),
      });
      if (!createRes.ok) {
        toast.error("Erreur lors de la creation du championnat");
        return;
      }
      const championship = await createRes.json();

      for (const team of scrapedTeams) {
        await fetch("/api/championships/standings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            championship_id: championship.id,
            home_team: team.team_name,
            away_team: "",
            home_score: team.points,
            away_score: 0,
          }),
        });
      }

      toast.success("Championnat importe avec succes");
      setFffOpen(false);
      resetFffDialog();
      const data = await fetch("/api/championships").then((r) => r.json());
      setChampionships(data);
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  function resetFffDialog() {
    setFffUrl("");
    setFffHtml("");
    setScrapedTeams(null);
    setImportName("");
    setImportSeason("2025-2026");
    setImportLevel("");
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
          <div className="flex gap-2">
            <Dialog open={fffOpen} onOpenChange={(open) => { setFffOpen(open); if (!open) resetFffDialog(); }}>
              <DialogTrigger render={<Button variant="outline" className="border-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/10 font-semibold" />}>
                <Download className="h-4 w-4 mr-1" />
                Scraper FFF
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Importer depuis la FFF</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!scrapedTeams ? (
                    <>
                      <div className="space-y-2">
                        <Label>URL de la page FFF</Label>
                        <Input
                          value={fffUrl}
                          onChange={(e) => setFffUrl(e.target.value)}
                          placeholder="https://www.fff.fr/competition/classement/..."
                        />
                        <p className="text-xs text-muted-foreground">
                          Collez l&apos;URL de la page classement du site FFF
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>HTML (alternative)</Label>
                        <textarea
                          value={fffHtml}
                          onChange={(e) => setFffHtml(e.target.value)}
                          placeholder="Collez le code HTML du tableau de classement..."
                          className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground">
                          Si l&apos;URL ne fonctionne pas, copiez le HTML depuis votre navigateur
                        </p>
                      </div>
                      <Button
                        onClick={handleFffScrape}
                        disabled={fffLoading || (!fffUrl && !fffHtml)}
                        className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                      >
                        {fffLoading ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours...</>
                        ) : (
                          "Analyser"
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label>Nom du championnat *</Label>
                        <Input
                          value={importName}
                          onChange={(e) => setImportName(e.target.value)}
                          placeholder="Ex: District D1 Senior"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Saison</Label>
                          <Input value={importSeason} onChange={(e) => setImportSeason(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Niveau</Label>
                          <Input value={importLevel} onChange={(e) => setImportLevel(e.target.value)} placeholder="Ex: District" />
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {scrapedTeams.length} equipes trouvees
                      </p>
                      <div className="max-h-60 overflow-y-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="p-1.5 text-left">#</th>
                              <th className="p-1.5 text-left">Equipe</th>
                              <th className="p-1.5 text-center">J</th>
                              <th className="p-1.5 text-center">V</th>
                              <th className="p-1.5 text-center">N</th>
                              <th className="p-1.5 text-center">D</th>
                              <th className="p-1.5 text-center">BP</th>
                              <th className="p-1.5 text-center">BC</th>
                              <th className="p-1.5 text-center font-bold">Pts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scrapedTeams.map((team, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="p-1.5">{idx + 1}</td>
                                <td className="p-1.5 font-medium">{team.team_name}</td>
                                <td className="p-1.5 text-center">{team.played}</td>
                                <td className="p-1.5 text-center">{team.won}</td>
                                <td className="p-1.5 text-center">{team.drawn}</td>
                                <td className="p-1.5 text-center">{team.lost}</td>
                                <td className="p-1.5 text-center">{team.goals_for}</td>
                                <td className="p-1.5 text-center">{team.goals_against}</td>
                                <td className="p-1.5 text-center font-bold">{team.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setScrapedTeams(null)} className="flex-1">
                          Retour
                        </Button>
                        <Button
                          onClick={handleFffSave}
                          disabled={saving || !importName.trim()}
                          className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                        >
                          {saving ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sauvegarde...</>
                          ) : (
                            "Importer"
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>

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
          </div>
        )}
      </div>

      {championships.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Aucun championnat</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isCoach ? "Creez un championnat ou importez depuis la FFF." : "Pas encore de championnat."}
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
