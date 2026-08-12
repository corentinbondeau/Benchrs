"use client";

import { useEffect, useState } from "react";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Plus, Loader2, Zap } from "lucide-react";
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

interface ScrapedMatch {
  date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  location?: string;
}

export default function ChampionshipPage() {
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  // Mode automatique DOFA
  const [dofaLoading, setDofaLoading] = useState(false);
  const [scrapedMatches, setScrapedMatches] = useState<ScrapedMatch[] | null>(null);
  const [importName, setImportName] = useState("");
  const [importSeason, setImportSeason] = useState("2025-2026");
  const [importLevel, setImportLevel] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Mode manuel (copier-coller)
  const [manualOpen, setManualOpen] = useState(false);
  const [fffUrl, setFffUrl] = useState("");
  const [fffHtml, setFffHtml] = useState("");
  const [fffLoading, setFffLoading] = useState(false);
  const [scrapedManualMatches, setScrapedManualMatches] = useState<ScrapedMatch[] | null>(null);

  useEffect(() => {
    if (!currentTeam) return;
    authFetch(`/api/championships?team_id=${currentTeam.id}`)
      .then((r) => r.json())
      .then((data) => {
        setChampionships(data);
        if (data.length > 0) setSelectedId(data[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [currentTeam]);

  if (!currentTeam) return null;

  // Mode automatique : récupère depuis DOFA via le numéro FFF du club
  async function handleFetchDOFA() {
    if (!currentTeam?.club_id) {
      toast.error("Club non trouvé");
      return;
    }
    setDofaLoading(true);
    setScrapedMatches(null);
    try {
      const res = await authFetch("/api/championships/dofa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam.id, type: "all" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la récupération DOFA");
        return;
      }
      if (data.matches && data.matches.length > 0) {
        setScrapedMatches(data.matches);
        toast.success(`${data.matches.length} matchs trouvés`);
      } else {
        toast.error("Aucun match trouvé pour ce club");
      }
    } catch (error) {
      toast.error("Erreur de connexion à DOFA");
      console.error(error);
    } finally {
      setDofaLoading(false);
    }
  }

  // Mode manuel : copier-coller HTML
  async function handleManualScrape() {
    if (!fffUrl && !fffHtml) {
      toast.error("Entrez une URL ou collez le HTML");
      return;
    }
    setFffLoading(true);
    setScrapedManualMatches(null);
    try {
      const res = await authFetch("/api/championships/fff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fffUrl || undefined, html: fffHtml || undefined, type: "all" }),
      });
      const data = await res.json();
      if (data.matches && data.matches.length > 0) {
        setScrapedManualMatches(data.matches);
        toast.success(`${data.matches.length} matchs trouvés`);
      } else if (data.error) {
        toast.error(data.error);
      } else {
        toast.error("Aucune donnée trouvée");
      }
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setFffLoading(false);
    }
  }

  async function handleSave(matches: ScrapedMatch[] | null) {
    if (!matches || matches.length === 0) {
      toast.error("Aucun match à importer");
      return;
    }
    if (!importName.trim()) {
      toast.error("Entrez un nom de championnat");
      return;
    }
    setSaving(true);
    try {
      const createRes = await authFetch("/api/championships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: importName.trim(),
          team_id: currentTeam!.id,
          season: importSeason,
          level: importLevel || null,
        }),
      });
      if (!createRes.ok) {
        toast.error("Erreur création championnat");
        return;
      }
      const championship = await createRes.json();

      // Sauvegarder les matchs
      for (const m of matches) {
        await authFetch("/api/championships/standings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            championship_id: championship.id,
            home_team: m.home_team,
            away_team: m.away_team,
            home_score: m.home_score ?? 0,
            away_score: m.away_score ?? 0,
            team_id: currentTeam!.id,
          }),
        });
      }

      toast.success("Championnat importé !");
      setManualOpen(false);
      setFffUrl("");
      setFffHtml("");
      setScrapedManualMatches(null);
      setImportName("");
      setImportSeason("2025-2026");
      setImportLevel("");
      const data = await authFetch(`/api/championships?team_id=${currentTeam!.id}`).then((r) => r.json());
      setChampionships(data);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  }

  const selected = championships.find((c) => c.id === selectedId);
  const sortedTeams = selected
    ? [...selected.teams].sort((a, b) => b.points - a.points || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against))
    : [];

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
        <h2 className="text-xl md:text-2xl font-bold">Championnat</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Championnat</h2>
          <p className="text-sm text-muted-foreground mt-1">Calendrier et classement</p>
        </div>
        {isCoach && (
          <div className="flex gap-2">
            <Button onClick={handleFetchDOFA} disabled={dofaLoading} className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold">
              {dofaLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
              {dofaLoading ? "Chargement..." : "Import auto FFF"}
            </Button>
            <Dialog open={manualOpen} onOpenChange={setManualOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Import manuel
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Importer championnat (copier-coller)</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>URL FFF (optionnel)</Label>
                    <Input
                      placeholder="https://www.fff.fr/..."
                      value={fffUrl}
                      onChange={(e) => setFffUrl(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OU collez le HTML de la page FFF</Label>
                    <textarea
                      placeholder="Collez le code source HTML de la page FFF..."
                      value={fffHtml}
                      onChange={(e) => setFffHtml(e.target.value)}
                      className="w-full border rounded-lg p-2 text-xs font-mono max-h-48"
                    />
                  </div>
                  <Button onClick={handleManualScrape} disabled={fffLoading || (!fffUrl && !fffHtml)} className="w-full">
                    {fffLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                    {fffLoading ? "Scraping..." : "Extraire les données"}
                  </Button>

                  {scrapedManualMatches && scrapedManualMatches.length > 0 && (
                    <>
                      <div className="rounded-lg border p-3 bg-green-50 dark:bg-green-950/20">
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">
                          ✅ {scrapedManualMatches.length} matchs trouvés
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label>Nom du championnat *</Label>
                        <Input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Ex: Championnat D4" className="text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>Saison</Label>
                          <Input value={importSeason} onChange={(e) => setImportSeason(e.target.value)} className="text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label>Niveau (optionnel)</Label>
                          <Input value={importLevel} onChange={(e) => setImportLevel(e.target.value)} placeholder="D4, etc" className="text-sm" />
                        </div>
                      </div>
                      <Button onClick={() => handleSave(scrapedManualMatches)} disabled={saving || !importName.trim()} className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold">
                        {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                        {saving ? "Sauvegarde..." : "Importer"}
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {scrapedMatches && scrapedMatches.length > 0 && (
        <Card className="border-[var(--color-gold)]/40">
          <CardHeader>
            <CardTitle className="text-base">Aperçu - Calendrier FFF (DOFA)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-1.5 text-left">Date</th>
                    <th className="p-1.5 text-left">Domicile</th>
                    <th className="p-1.5 text-center">Score</th>
                    <th className="p-1.5 text-left">Extérieur</th>
                    <th className="p-1.5 text-left">Lieu</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapedMatches.slice(0, 10).map((m, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1.5 whitespace-nowrap text-muted-foreground">{m.date}</td>
                      <td className="p-1.5 font-medium">{m.home_team}</td>
                      <td className="p-1.5 text-center font-bold">
                        {m.home_score !== null ? `${m.home_score}-${m.away_score}` : "-"}
                      </td>
                      <td className="p-1.5 font-medium">{m.away_team}</td>
                      <td className="p-1.5 text-xs text-muted-foreground">{m.location || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {scrapedMatches.length > 10 ? `Affichage des 10 premiers, ${scrapedMatches.length - 10} supplémentaires` : "Tous les matchs affichés"}
            </p>
          </CardContent>
        </Card>
      )}

      {championships.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Aucun championnat</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isCoach ? "Utilisez l'import auto FFF ou ajoutez manuellement." : "Pas encore de championnat."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {championships.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`shrink-0 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                  c.id === selectedId
                    ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                    : "border hover:bg-muted"
                }`}
              >
                {c.name}
                <Badge variant="outline" className="ml-2 text-xs">
                  {c.season}
                </Badge>
              </button>
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
                  <p className="text-muted-foreground text-sm text-center py-6">Aucune équipe dans le classement</p>
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left whitespace-nowrap">#</th>
                          <th className="p-2 text-left min-w-[120px]">Équipe</th>
                          <th className="p-2 text-center whitespace-nowrap">J</th>
                          <th className="p-2 text-center whitespace-nowrap">V</th>
                          <th className="p-2 text-center whitespace-nowrap">N</th>
                          <th className="p-2 text-center whitespace-nowrap">D</th>
                          <th className="p-2 text-center whitespace-nowrap">BP</th>
                          <th className="p-2 text-center whitespace-nowrap">BC</th>
                          <th className="p-2 text-center font-bold whitespace-nowrap">Pts</th>
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
