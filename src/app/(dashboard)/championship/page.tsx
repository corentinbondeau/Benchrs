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

interface ScrapedMatch {
  matchday?: number | null;
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
  const [dofaMatches, setDofaMatches] = useState<ScrapedMatch[] | null>(null);
  const [dofaStandings, setDofaStandings] = useState<ChampionshipTeam[] | null>(null);
  const [dofaTab, setDofaTab] = useState<"calendar" | "standings">("calendar");

  // Sélection club/équipe
  const [selectTeamOpen, setSelectTeamOpen] = useState(false);
  const [clubSearch, setClubSearch] = useState("");
  const [foundTeams, setFoundTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [searching, setSearching] = useState(false);

  // Rechercher les équipes du club
  async function handleSearchClub() {
    if (!clubSearch.trim()) {
      toast.error("Entrez un numéro FFF");
      return;
    }
    setSearching(true);
    try {
      const res = await authFetch("/api/championships/dofa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fffNumber: clubSearch.trim(), type: "all" }),
      });
      const data = await res.json();
      if (data.equipes && data.equipes.length > 0) {
        setFoundTeams(data.equipes);
        if (data.equipes.length === 1) {
          setSelectedTeam(data.equipes[0]);
        }
      } else {
        toast.error("Aucune équipe trouvée");
      }
    } catch (e) {
      toast.error("Erreur recherche club");
      console.error(e);
    } finally {
      setSearching(false);
    }
  }

  // Importer avec l'équipe sélectionnée
  function handleImportTeam() {
    if (!selectedTeam) {
      toast.error("Sélectionnez une équipe");
      return;
    }
    setSelectTeamOpen(false);
    setClubSearch("");
    setFoundTeams([]);
    setSelectedTeam("");
    handleFetchDOFA();
  }

  // Mode manuel (copier-coller HTML)
  const [manualOpen, setManualOpen] = useState(false);
  const [fffUrl, setFffUrl] = useState("");
  const [fffHtml, setFffHtml] = useState("");
  const [fffLoading, setFffLoading] = useState(false);
  const [scrapedMatches, setScrapedMatches] = useState<ScrapedMatch[] | null>(null);

  // Formulaire d'import commun
  const [importName, setImportName] = useState("");
  const [importSeason, setImportSeason] = useState("2025-2026");
  const [importLevel, setImportLevel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authFetch(`/api/championships?team_id=${currentTeam!.id}`)
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
    setDofaLoading(true);
    setDofaMatches(null);
    setDofaStandings(null);
    setDofaTab("calendar");
    try {
      const res = await authFetch("/api/championships/dofa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam!.id, type: "all" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la récupération DOFA");
        return;
      }
      if (data.matches && data.matches.length > 0) {
        // Trier les matchs par date chronologique
        const sorted = [...data.matches].sort(
          (a: ScrapedMatch, b: ScrapedMatch) => a.date.localeCompare(b.date)
        );
        setDofaMatches(sorted);
        if (data.standings && data.standings.length > 0) {
          setDofaStandings(data.standings);
        }
        const standingsMsg = data.standings ? ` + ${data.standings.length} équipes au classement` : "";
        toast.success(`${data.matches.length} matchs trouvés${standingsMsg}`);
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

  async function handleFffScrape() {
    if (!fffUrl && !fffHtml) {
      toast.error("Entrez une URL ou collez le HTML");
      return;
    }
    setFffLoading(true);
    setScrapedMatches(null);
    try {
      const res = await authFetch("/api/championships/fff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fffUrl || undefined, html: fffHtml || undefined, type: "calendar" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.matches && data.matches.length > 0) {
          setScrapedMatches(data.matches);
        } else {
          toast.error(data.error || "Erreur lors du scraping");
          return;
        }
      } else {
        if (data.matches) setScrapedMatches(data.matches);
      }
      const matchCount = data.matches?.length ?? 0;
      if (matchCount > 0) toast.success(`${matchCount} matchs trouvés`);
      else toast.error("Aucun match trouvé dans le contenu");
    } catch {
      toast.error("Erreur de connexion");
    } finally {
      setFffLoading(false);
    }
  }

  async function handleSaveMatches(matches: ScrapedMatch[] | null, source: "dofa" | "manual") {
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
          season: importSeason,
          level: importLevel || null,
          team_id: currentTeam!.id,
        }),
      });
      if (!createRes.ok) {
        toast.error("Erreur lors de la création du championnat");
        return;
      }
      const championship = await createRes.json();

      // Si classement DOFA disponible, importer les équipes en premier
      if (source === "dofa" && dofaStandings && dofaStandings.length > 0) {
        for (const team of dofaStandings) {
          await authFetch("/api/championships/standings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              championship_id: championship.id,
              home_team: team.team_name,
              away_team: "",
              home_score: team.goals_for,
              away_score: team.goals_against,
              team_id: currentTeam!.id,
            }),
          });
        }
      }

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

      toast.success("Championnat importé avec succès");
      if (source === "dofa") {
        setDofaMatches(null);
        setDofaStandings(null);
        setImportName("");
        setImportSeason("2025-2026");
        setImportLevel("");
      } else {
        setManualOpen(false);
        resetFffDialog();
      }
      const data = await authFetch(`/api/championships?team_id=${currentTeam!.id}`).then((r) => r.json());
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
    setScrapedMatches(null);
    setImportName("");
    setImportSeason("2025-2026");
    setImportLevel("");
  }

  const selected = championships.find((c) => c.id === selectedId);
  const sortedTeams = selected
    ? [...selected.teams].sort(
        (a, b) =>
          b.points - a.points ||
          b.goals_for - b.goals_against - (a.goals_for - a.goals_against)
      )
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
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Championnat</h2>
          <p className="text-sm text-muted-foreground mt-1">Classement et résultats</p>
        </div>
        {isCoach && (
          <div className="flex gap-2">
            {/* Dialog Sélection club/équipe */}
            <Dialog open={selectTeamOpen} onOpenChange={setSelectTeamOpen}>
              <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
                <Zap className="h-4 w-4 mr-1" />
                Import auto FFF
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Sélectionner votre équipe</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Numéro FFF du club (6 chiffres)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="123456"
                        value={clubSearch}
                        onChange={(e) => setClubSearch(e.target.value)}
                        maxLength={6}
                      />
                      <Button
                        onClick={handleSearchClub}
                        disabled={searching || !clubSearch.trim()}
                        variant="outline"
                      >
                        {searching ? "Recherche..." : "Chercher"}
                      </Button>
                    </div>
                  </div>

                  {foundTeams.length > 0 && (
                    <div className="space-y-2">
                      <Label>Équipes trouvées</Label>
                      <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1">
                        {foundTeams.map((team) => (
                          <label key={team} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                            <input
                              type="radio"
                              name="team"
                              value={team}
                              checked={selectedTeam === team}
                              onChange={(e) => setSelectedTeam(e.target.value)}
                            />
                            <span className="text-sm">{team}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectTeamOpen(false)} className="flex-1">
                      Annuler
                    </Button>
                    <Button
                      onClick={handleImportTeam}
                      disabled={!selectedTeam}
                      className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
                    >
                      Importer
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Dialog Import manuel */}
            <Dialog
              open={manualOpen}
              onOpenChange={(open) => {
                setManualOpen(open);
                if (!open) resetFffDialog();
              }}
            >
              <DialogTrigger render={<Button variant="outline" />}>
                <Plus className="h-4 w-4 mr-1" />
                Import manuel
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Import manuel depuis la FFF</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!scrapedMatches ? (
                    <>
                      <div className="space-y-2">
                        <Label>URL de la page FFF (optionnel)</Label>
                        <Input
                          value={fffUrl}
                          onChange={(e) => setFffUrl(e.target.value)}
                          placeholder="https://www.fff.fr/competition/calendrier/..."
                        />
                        <p className="text-xs text-muted-foreground">
                          Collez l&apos;URL de la page calendrier du site FFF (peut être bloquée)
                        </p>
                      </div>

                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">ou</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>HTML de la page (optionnel)</Label>
                        <textarea
                          value={fffHtml}
                          onChange={(e) => setFffHtml(e.target.value)}
                          placeholder="Collez ici le HTML complet de la page calendrier FFF..."
                          className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground">
                          Faites Ctrl+U puis Ctrl+A puis Ctrl+C sur la page calendrier FFF
                        </p>
                      </div>

                      <Button
                        onClick={handleFffScrape}
                        disabled={fffLoading || (!fffUrl && !fffHtml)}
                        className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                      >
                        {fffLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse en cours...
                          </>
                        ) : (
                          "Extraire données"
                        )}
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Aperçu des matchs extraits */}
                      <div className="max-h-48 overflow-y-auto overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="p-1.5 text-left">Date</th>
                              <th className="p-1.5 text-left">Domicile</th>
                              <th className="p-1.5 text-center">Score</th>
                              <th className="p-1.5 text-left">Extérieur</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scrapedMatches.slice(0, 10).map((m, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="p-1.5 whitespace-nowrap">{m.date}</td>
                                <td
                                  className={`p-1.5 font-medium ${
                                    m.home_score !== null &&
                                    (m.home_score ?? 0) > (m.away_score ?? 0)
                                      ? "text-green-600"
                                      : ""
                                  }`}
                                >
                                  {m.home_team}
                                </td>
                                <td className="p-1.5 text-center font-bold">
                                  {m.home_score !== null
                                    ? `${m.home_score} - ${m.away_score}`
                                    : "?"}
                                </td>
                                <td
                                  className={`p-1.5 font-medium ${
                                    m.away_score !== null &&
                                    (m.away_score ?? 0) > (m.home_score ?? 0)
                                      ? "text-green-600"
                                      : ""
                                  }`}
                                >
                                  {m.away_team}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {scrapedMatches.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center">
                          … et {scrapedMatches.length - 10} autres matchs
                        </p>
                      )}

                      {/* Formulaire d'import */}
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
                          <Input
                            value={importSeason}
                            onChange={(e) => setImportSeason(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Niveau</Label>
                          <Input
                            value={importLevel}
                            onChange={(e) => setImportLevel(e.target.value)}
                            placeholder="Ex: District"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setScrapedMatches(null)}
                          className="flex-1"
                        >
                          Retour
                        </Button>
                        <Button
                          onClick={() => handleSaveMatches(scrapedMatches, "manual")}
                          disabled={saving || !importName.trim()}
                          className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                        >
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sauvegarde...
                            </>
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
          </div>
        )}
      </div>

      {/* Aperçu DOFA */}
      {dofaMatches && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-[var(--color-gold)]" />
              Aperçu DOFA
              <Badge variant="outline" className="ml-auto text-xs">
                {dofaMatches.length} matchs
                {dofaStandings ? ` · ${dofaStandings.length} équipes` : ""}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Onglets Calendrier / Classement */}
            <div className="flex gap-1 border-b">
              <button
                onClick={() => setDofaTab("calendar")}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                  dofaTab === "calendar"
                    ? "border-[var(--color-gold)] text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Calendrier
              </button>
              {dofaStandings && (
                <button
                  onClick={() => setDofaTab("standings")}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                    dofaTab === "standings"
                      ? "border-[var(--color-gold)] text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Classement
                </button>
              )}
            </div>

            {/* Onglet Calendrier : tous les matchs triés par date */}
            {dofaTab === "calendar" && (
              <div className="rounded-lg border overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-1.5 text-left">Date</th>
                      <th className="p-1.5 text-left">Domicile</th>
                      <th className="p-1.5 text-center">Score</th>
                      <th className="p-1.5 text-left">Extérieur</th>
                      <th className="p-1.5 text-left">Lieu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dofaMatches.map((m, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-1.5 whitespace-nowrap">{m.date}</td>
                        <td
                          className={`p-1.5 font-medium ${
                            m.home_score !== null &&
                            (m.home_score ?? 0) > (m.away_score ?? 0)
                              ? "text-green-600"
                              : ""
                          }`}
                        >
                          {m.home_team}
                        </td>
                        <td className="p-1.5 text-center font-bold">
                          {m.home_score !== null
                            ? `${m.home_score} - ${m.away_score}`
                            : "?"}
                        </td>
                        <td
                          className={`p-1.5 font-medium ${
                            m.away_score !== null &&
                            (m.away_score ?? 0) > (m.home_score ?? 0)
                              ? "text-green-600"
                              : ""
                          }`}
                        >
                          {m.away_team}
                        </td>
                        <td className="p-1.5 text-muted-foreground">{m.location ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Onglet Classement */}
            {dofaTab === "standings" && dofaStandings && (
              <div className="rounded-lg border overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-1.5 text-left">#</th>
                      <th className="p-1.5 text-left min-w-[120px]">Équipe</th>
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
                    {dofaStandings.map((team, idx) => (
                      <tr
                        key={team.id}
                        className={`border-t ${idx === 0 ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
                      >
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
            )}

            {/* Formulaire d'import */}
            <div className="space-y-3 pt-2 border-t">
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
                  <Input
                    value={importSeason}
                    onChange={(e) => setImportSeason(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Niveau</Label>
                  <Input
                    value={importLevel}
                    onChange={(e) => setImportLevel(e.target.value)}
                    placeholder="Ex: District"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDofaMatches(null);
                    setDofaStandings(null);
                    setImportName("");
                    setImportSeason("2025-2026");
                    setImportLevel("");
                  }}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => handleSaveMatches(dofaMatches, "dofa")}
                  disabled={saving || !importName.trim()}
                  className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sauvegarde...
                    </>
                  ) : (
                    "Importer"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste des championnats */}
      {championships.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Aucun championnat</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isCoach
                ? "Utilisez « Import auto FFF » pour importer votre championnat."
                : "Pas encore de championnat."}
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
                <Badge variant="outline" className="ml-2 text-xs">
                  {c.season}
                </Badge>
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
                    Aucune équipe dans le classement
                  </p>
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
                          <tr
                            key={team.id}
                            className={`border-t ${
                              idx === 0 ? "bg-amber-50 dark:bg-amber-950/20" : ""
                            }`}
                          >
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
