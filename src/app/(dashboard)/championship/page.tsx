"use client";

import { useCallback, useEffect, useState } from "react";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Plus, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { DofaJournee } from "@/lib/dofa/poule-journees";
import { currentSeasonLabel } from "@/lib/goals";
import PouleResultsCard, { type PouleMatch } from "@/components/championship/PouleResultsCard";
import { FFFImportWizard } from "@/components/championship/FFFImportWizard";

interface Championship {
  id: string;
  name: string;
  season: string;
  level: string | null;
  teams: ChampionshipTeam[];
  matches?: PouleMatch[];
  dofa_cp_no?: number | null;
  dofa_phase?: number | null;
  dofa_poule?: number | null;
  dofa_cl_no?: number | null;
  dofa_team_number?: number | null;
  last_imported_at?: string | null;
  standings_coverage?: "full" | "partial";
  standings_source?: "official" | "computed";
  team_name?: string | null;
  journees?: DofaJournee[] | null;
}

interface ChampionshipTeam {
  id: string;
  cl_no?: number;
  number?: number;
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
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  // Création d'un nouveau championnat (nom/saison/niveau uniquement).
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSeason, setCreateSeason] = useState(() => currentSeasonLabel());
  const [createLevel, setCreateLevel] = useState("");
  const [creating, setCreating] = useState(false);

  const teamId = currentTeam?.id;
  const loadChampionships = useCallback(async (): Promise<Championship[]> => {
    if (!teamId) return [];
    const data = (await authFetch(`/api/championships?team_id=${teamId}`).then((r) => r.json())) as Championship[];
    return data;
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;
    loadChampionships().then((data) => {
      if (cancelled) return;
      setChampionships(data);
      if (data.length > 0) {
        setSelectedId((prev) => (prev && data.some((c) => c.id === prev) ? prev : data[0].id));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadChampionships]);

  if (!currentTeam) return null;

  async function handleCreateChampionship() {
    if (!createName.trim()) {
      toast.error("Entrez un nom de championnat");
      return;
    }
    setCreating(true);
    try {
      const res = await authFetch("/api/championships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          season: createSeason,
          level: createLevel || null,
          team_id: currentTeam!.id,
        }),
      });
      if (!res.ok) {
        toast.error("Erreur lors de la création du championnat");
        return;
      }
      const championship = await res.json();
      toast.success("Championnat créé");
      setCreateOpen(false);
      setCreateName("");
      setCreateSeason(currentSeasonLabel());
      setCreateLevel("");
      const data = await authFetch(`/api/championships?team_id=${currentTeam!.id}`).then((r) => r.json());
      setChampionships(data);
      setSelectedId(championship.id);
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setCreating(false);
    }
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
      <div className="section-gap">
        <h1 className="text-2xl font-bold">Championnat</h1>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="section-gap">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Championnat</h1>
          <p className="text-sm text-muted-foreground mt-1">Classement et résultats</p>
        </div>
        {isCoach && (
          <div className="flex gap-2 flex-wrap">
            {/* Import FFF — wizard 3 clics */}
            <FFFImportWizard
              teamId={currentTeam.id}
              onImported={() => loadChampionships().then((data) => setChampionships(data))}
              defaultClNo={selected?.dofa_cl_no ?? undefined}
            />

            {/* Dialog Nouveau championnat */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger render={<Button variant="outline" />}>
                <Plus className="h-4 w-4 mr-1" />
                Nouveau championnat
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Nouveau championnat</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom du championnat *</Label>
                    <Input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Ex: District D1 Senior"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Saison</Label>
                      <Input value={createSeason} onChange={(e) => setCreateSeason(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Niveau</Label>
                      <Input
                        value={createLevel}
                        onChange={(e) => setCreateLevel(e.target.value)}
                        placeholder="Ex: District"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleCreateChampionship}
                    disabled={creating || !createName.trim()}
                    className="w-full bg-[var(--color-primary-blue)] text-white font-semibold"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Création...
                      </>
                    ) : (
                      "Créer"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Liste des championnats */}
      {championships.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg">Aucun championnat</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {isCoach
                ? "Cliquez sur « Importer depuis la FFF » pour commencer, ou créez un championnat manuellement."
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
            <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <Medal className="h-4 w-4" />
                  Classement — {selected.name}
                  {sortedTeams.length > 0 && (
                    selected.standings_source === "official" ? (
                      <Badge
                        variant="outline"
                        className="ml-auto text-xs border-green-400 text-green-800 dark:border-green-600 dark:text-green-200"
                      >
                        Classement officiel
                      </Badge>
                    ) : selected.standings_coverage === "partial" ? (
                      <Badge
                        variant="outline"
                        className="ml-auto text-xs border-amber-400 text-amber-800 dark:text-amber-200"
                      >
                        Classement partiel
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="ml-auto text-xs"
                        title="Le classement officiel FFF n'est pas encore accessible (service bloqué côté FFF) : ce classement est calculé à partir des résultats saisis."
                      >
                        Classement calculé
                      </Badge>
                    )
                  )}
                  {isCoach && selected.dofa_cp_no == null && (
                    <Badge variant="outline" className="text-xs">
                      Poule FFF non configurée
                    </Badge>
                  )}
                  {isCoach && selected.dofa_cp_no != null && selected.dofa_cl_no == null && (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-400 text-amber-800 dark:text-amber-200"
                      title="L'agenda ne peut pas être alimenté automatiquement tant que vous n'avez pas choisi votre équipe."
                    >
                      Équipe non choisie — agenda non alimenté
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedTeams.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    Aucune équipe dans le classement
                  </p>
                ) : (
                  <>
                    {selected.standings_coverage === "partial" && (
                      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-4 mb-4">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">
                            Classement incomplet
                          </p>
                          <p className="text-amber-700 dark:text-amber-300 mt-1">
                            Seuls les matchs de votre équipe sont en base. Ce classement est indicatif
                            uniquement — les totaux des autres équipes sont partiels. Pour un classement
                            fiable, importez tous les matchs de la poule via « Importer depuis la FFF ».
                          </p>
                        </div>
                      </div>
                    )}
                    <div className={`rounded-lg border overflow-x-auto${selected.standings_coverage === "partial" ? " opacity-60" : ""}`}>
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
                  </>
                )}
              </CardContent>
            </Card>

            <PouleResultsCard
              championshipId={selected.id}
              teams={selected.teams.map((t) => ({
                cl_no: t.cl_no ?? 0,
                number: t.number ?? 0,
                team_name: t.team_name,
              }))}
              matches={selected.matches ?? []}
              journees={selected.journees ?? []}
              isCoach={isCoach}
              onChanged={() => loadChampionships().then((data) => setChampionships(data))}
            />
            </>
          )}
        </>
      )}
    </div>
  );
}
