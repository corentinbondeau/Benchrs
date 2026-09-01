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
import { Trophy, Medal, Plus, Loader2, Zap, AlertTriangle, ExternalLink, Users } from "lucide-react";
import { toast } from "sonner";
import { parsePouleUrl } from "@/lib/dofa/poule-url";
import { parseDofaMatches } from "@/lib/dofa/parse-matches";
import { extractPouleTeams, type PouleTeam } from "@/lib/dofa/poule-teams";

interface Championship {
  id: string;
  name: string;
  season: string;
  level: string | null;
  teams: ChampionshipTeam[];
  dofa_cp_no?: number | null;
  dofa_phase?: number | null;
  dofa_poule?: number | null;
  dofa_cl_no?: number | null;
  dofa_team_number?: number | null;
  last_imported_at?: string | null;
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

interface DofaEventSyncResult {
  created: number;
  updated: number;
  noop: number;
  conflict: number;
  skippedLocked: number;
  postponed: number;
  rescheduledResetAttendances: number;
  errors: number;
}

interface DofaImportResult {
  imported: number;
  updated: number;
  skipped: number;
  source: string;
  eventSync: DofaEventSyncResult;
}

/** Base de l'API DOFA (calendrier public d'une poule), ouverte dans un
 * nouvel onglet par le coach — jamais appelée depuis le serveur Benchrs
 * (bloquée par un pare-feu Akamai côté FFF pour toute requête serveur). */
const DOFA_CALENDRIER_BASE = "https://api-dofa.fff.fr/api/compets";

export default function ChampionshipPage() {
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [championships, setChampionships] = useState<Championship[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  // Import DOFA — saisie/édition de l'URL de poule, puis collage du JSON.
  const [pouleDialogOpen, setPouleDialogOpen] = useState(false);
  const [pouleUrlInput, setPouleUrlInput] = useState("");
  const [pouleUrlEditing, setPouleUrlEditing] = useState(false);
  const [pouleSaveError, setPouleSaveError] = useState<string | null>(null);
  const [pouleSaving, setPouleSaving] = useState(false);
  const [pasteInput, setPasteInput] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteImporting, setPasteImporting] = useState(false);
  const [lastImportResult, setLastImportResult] = useState<DofaImportResult | null>(null);

  // Choix de l'équipe du coach dans la poule — reconstituée à partir du
  // dernier collage (`extractPouleTeams`). Nécessaire pour activer l'agenda
  // (`planEventSync` filtre sur cette identité) et pour basculer le lien
  // « Ouvrir mes matchs » sur la saison complète du club (1 page, 22 matchs)
  // plutôt que sur la seule journée à venir (calendrier, 12 équipes).
  const [pouleTeams, setPouleTeams] = useState<PouleTeam[]>([]);
  const [teamChoiceSaving, setTeamChoiceSaving] = useState<string | null>(null);
  const [teamChoiceError, setTeamChoiceError] = useState<string | null>(null);

  // Création d'un nouveau championnat (nom/saison/niveau uniquement).
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createSeason, setCreateSeason] = useState("2025-2026");
  const [createLevel, setCreateLevel] = useState("");
  const [creating, setCreating] = useState(false);

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

  function dismissLastImportResult() {
    setLastImportResult(null);
  }

  // Enregistre (première fois) ou modifie (bouton « Changer de poule ») le
  // triplet DOFA du championnat actuellement sélectionné. `parsePouleUrl`
  // donne un retour immédiat : une entrée invalide ne déclenche même pas
  // d'appel réseau.
  async function handleSavePouleUrl() {
    if (!selected) {
      setPouleSaveError("Créez d'abord un championnat (bouton « Nouveau championnat »).");
      return;
    }
    const triplet = parsePouleUrl(pouleUrlInput);
    if (!triplet) {
      setPouleSaveError(
        "URL ou triplet invalide. Collez l'URL de la page de poule du site du district (ex. flandres.fff.fr), ou saisissez le triplet \"cpNo/phase/poule\"."
      );
      return;
    }
    setPouleSaveError(null);
    setPouleSaving(true);
    try {
      const res = await authFetch("/api/championships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          cpNo: triplet.cpNo,
          phase: triplet.phase,
          poule: triplet.poule,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPouleSaveError(data.error || "Le serveur a refusé l'enregistrement de la poule.");
        return;
      }
      setChampionships((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...data } : c)));
      setPouleUrlEditing(false);
      setPouleUrlInput("");
      toast.success("Poule DOFA configurée. Ouvrez le calendrier ci-dessous, collez-le, puis choisissez votre équipe.");
    } catch {
      // 🔒 Distinct du message de validation ci-dessus : ceci est une panne
      // réseau/serveur, pas une saisie invalide.
      setPouleSaveError("Impossible de contacter le serveur Benchrs (connexion). Réessayez.");
    } finally {
      setPouleSaving(false);
    }
  }

  // Parcours cible : le coach a ouvert le lien « Ouvrir mes matchs », fait
  // Ctrl+A / Ctrl+C sur la page JSON, puis colle ici. Accepte aussi bien le
  // tableau nu que l'enveloppe Hydra — le serveur (`validateIngestPayload`)
  // sait déjà gérer les deux formes ; ce parsing côté client sert
  // uniquement à distinguer un texte illisible (page HTML, texte quelconque)
  // d'un JSON exploitable, AVANT même l'appel réseau.
  async function handleImportPaste() {
    if (!selected || selected.dofa_cp_no == null || selected.dofa_phase == null || selected.dofa_poule == null) {
      setPasteError("Configurez d'abord la poule de ce championnat ci-dessus.");
      return;
    }

    const trimmed = pasteInput.trim();
    if (!trimmed) {
      setPasteError("Collez d'abord le contenu de la page « Ouvrir mes matchs ».");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setPasteError(
        "Ce contenu n'est pas un JSON valide. Assurez-vous d'avoir collé le texte de la page « Ouvrir mes matchs » (Ctrl+A puis Ctrl+C sur cette page, pas sur une autre)."
      );
      return;
    }

    const matches = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["hydra:member"])
        ? (parsed as Record<string, unknown>)["hydra:member"]
        : null;

    if (matches === null) {
      setPasteError(
        "Le format collé n'est pas reconnu (ni tableau de matchs, ni enveloppe attendue). Vérifiez que vous avez bien copié le contenu de la page « Ouvrir mes matchs »."
      );
      return;
    }

    setPasteError(null);
    setPasteImporting(true);
    try {
      // Reconstitue la liste des équipes de la poule à partir du même
      // contenu collé, AVANT l'import : le coach doit pouvoir choisir son
      // équipe même si l'import lui-même échoue (poule déjà à jour, etc.).
      try {
        const parsedMatches = parseDofaMatches(matches);
        setPouleTeams(extractPouleTeams(parsedMatches));
      } catch {
        // La liste des équipes est un confort, pas une condition de succès
        // de l'import : une erreur de reconstitution ne doit jamais
        // bloquer l'import lui-même.
      }

      const res = await authFetch("/api/championships/dofa/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: currentTeam!.id,
          cpNo: selected.dofa_cp_no,
          phase: selected.dofa_phase,
          poule: selected.dofa_poule,
          matches,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPasteError(data.error || "L'import a été refusé par le serveur. Aucune donnée n'a été modifiée.");
        return;
      }
      setLastImportResult(data as DofaImportResult);
      setPasteInput("");
      toast.success("Import terminé.");
      const refreshed = await authFetch(`/api/championships?team_id=${currentTeam!.id}`).then((r) => r.json());
      setChampionships(refreshed);
    } catch {
      setPasteError("Erreur de connexion pendant l'import. Aucune donnée n'a été modifiée.");
    } finally {
      setPasteImporting(false);
    }
  }

  // Persiste le choix de l'équipe du coach dans la poule (dofa_cl_no /
  // dofa_team_number). Le triplet de poule est ré-envoyé avec (contrat de
  // PATCH /api/championships : le triplet est toujours requis), repris de
  // l'état déjà enregistré du championnat sélectionné.
  async function handleChooseTeam(team: PouleTeam) {
    if (!selected || selected.dofa_cp_no == null || selected.dofa_phase == null || selected.dofa_poule == null) {
      return;
    }
    const teamKey = `${team.clNo}/${team.number}`;
    setTeamChoiceSaving(teamKey);
    setTeamChoiceError(null);
    try {
      const res = await authFetch("/api/championships", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          cpNo: selected.dofa_cp_no,
          phase: selected.dofa_phase,
          poule: selected.dofa_poule,
          clNo: team.clNo,
          teamNumber: team.number,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTeamChoiceError(data.error || "Le serveur a refusé l'enregistrement de l'équipe.");
        return;
      }
      setChampionships((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...data } : c)));
      toast.success(`Équipe ${team.shortName} enregistrée. Votre agenda va se remplir automatiquement.`);
    } catch {
      setTeamChoiceError("Impossible de contacter le serveur Benchrs (connexion). Réessayez.");
    } finally {
      setTeamChoiceSaving(null);
    }
  }

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
      setCreateSeason("2025-2026");
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

  const matchesLink =
    selected && selected.dofa_cp_no != null && selected.dofa_phase != null && selected.dofa_poule != null
      ? selected.dofa_cl_no != null
        ? // Identité connue : saison complète du club, filtrée par clNo —
          // 22 matchs en UNE seule page. ⚠️ Ne jamais utiliser `/matchs`
          // sans filtre : 132 matchs paginés sur 5 pages, cinq collages
          // seraient inacceptables.
          `${DOFA_CALENDRIER_BASE}/${selected.dofa_cp_no}/phases/${selected.dofa_phase}/poules/${selected.dofa_poule}/matchs?clNo=${selected.dofa_cl_no}`
        : // Identité inconnue : la journée à venir (calendrier), suffisante
          // pour découvrir les 12 équipes de la poule.
          `${DOFA_CALENDRIER_BASE}/${selected.dofa_cp_no}/phases/${selected.dofa_phase}/poules/${selected.dofa_poule}/calendrier`
      : null;

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
          <div className="flex gap-2">
            {/* Dialog Import DOFA — poule + collage des matchs */}
            <Dialog
              open={pouleDialogOpen}
              onOpenChange={(open) => {
                setPouleDialogOpen(open);
                if (!open) {
                  setPouleUrlEditing(false);
                  setPouleUrlInput("");
                  setPouleSaveError(null);
                  setPasteError(null);
                  setTeamChoiceError(null);
                }
              }}
            >
              <DialogTrigger render={<Button className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" />}>
                <Zap className="h-4 w-4 mr-1" />
                Import DOFA
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Import DOFA — poule du championnat</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {!selected ? (
                    <p className="text-sm text-muted-foreground">
                      Créez d&apos;abord un championnat (bouton « Nouveau championnat » ci-contre),
                      puis revenez ici pour lui associer la poule DOFA de votre équipe.
                    </p>
                  ) : selected.dofa_cp_no != null && !pouleUrlEditing ? (
                    <>
                      <div className="rounded-lg bg-green-50 dark:bg-green-950 p-4 border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-green-600 rounded-full" />
                          <span className="font-semibold text-green-900 dark:text-green-100">
                            Poule configurée
                          </span>
                        </div>
                        <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                          Compétition {selected.dofa_cp_no} · phase {selected.dofa_phase} · poule{" "}
                          {selected.dofa_poule}
                        </p>
                      </div>

                      {/* Équipe choisie par le coach — sans elle, l'agenda ne peut pas
                          être alimenté (planEventSync filtre sur cette identité). */}
                      {selected.dofa_cl_no != null ? (
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-[var(--color-primary-blue)] shrink-0" />
                            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              Votre équipe :{" "}
                              {pouleTeams.find(
                                (t) => t.clNo === selected.dofa_cl_no && t.number === selected.dofa_team_number
                              )?.shortName ?? `équipe n°${selected.dofa_team_number}`}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          role="alert"
                          className="rounded-lg bg-amber-50 dark:bg-amber-950/40 p-3 border border-amber-300 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-100"
                        >
                          Équipe non choisie : l&apos;agenda ne peut pas encore se remplir
                          automatiquement. Collez d&apos;abord le calendrier ci-dessous, puis
                          cliquez sur votre équipe dans la liste qui apparaîtra.
                        </div>
                      )}

                      {/* Étape 2 : ouvrir le lien des matchs — la journée à venir tant que
                          l'équipe n'est pas choisie (pour découvrir la poule), la saison
                          complète du club en une page une fois l'équipe connue. */}
                      {matchesLink && (
                        <a
                          href={matchesLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary-blue)] hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          {selected.dofa_cl_no != null
                            ? "Ouvrir mes matchs (saison complète)"
                            : "Ouvrir le calendrier de la poule"}
                        </a>
                      )}

                      {/* Liste des équipes de la poule : à cliquer pour choisir/changer
                          d'équipe. Apparaît dès qu'un calendrier a été collé. */}
                      {pouleTeams.length > 0 && (
                        <div className="space-y-2">
                          <Label>
                            {selected.dofa_cl_no != null
                              ? "Changer d'équipe"
                              : "Cliquez sur votre équipe"}
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {pouleTeams.map((team) => {
                              const teamKey = `${team.clNo}/${team.number}`;
                              const isCurrent =
                                selected.dofa_cl_no === team.clNo && selected.dofa_team_number === team.number;
                              return (
                                <Button
                                  key={teamKey}
                                  variant={isCurrent ? "secondary" : "outline"}
                                  size="sm"
                                  disabled={teamChoiceSaving !== null}
                                  onClick={() => handleChooseTeam(team)}
                                >
                                  {teamChoiceSaving === teamKey ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : null}
                                  {team.shortName}
                                </Button>
                              );
                            })}
                          </div>
                          {teamChoiceError && (
                            <p role="alert" className="text-xs text-destructive">
                              {teamChoiceError}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Étape 3 : coller le JSON récupéré */}
                      <div className="space-y-2">
                        <Label htmlFor="dofa-paste-input">Coller le contenu de la page ici</Label>
                        <textarea
                          id="dofa-paste-input"
                          value={pasteInput}
                          onChange={(e) => {
                            setPasteInput(e.target.value);
                            setPasteError(null);
                          }}
                          placeholder='[{ "ma_no": ... }] ou { "hydra:member": [...] }'
                          className="w-full h-28 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                          {selected.dofa_cl_no != null
                            ? "Ouvrez le lien ci-dessus, sélectionnez tout (Ctrl+A), copiez (Ctrl+C), puis collez ici (Ctrl+V) : votre saison complète sera importée."
                            : "Ouvrez le lien ci-dessus, sélectionnez tout (Ctrl+A), copiez (Ctrl+C), puis collez ici (Ctrl+V) : Benchrs affichera la liste des équipes de la poule pour que vous cliquiez la vôtre."}
                        </p>
                        {pasteError && (
                          <p role="alert" className="text-xs text-destructive">
                            {pasteError}
                          </p>
                        )}
                        <Button
                          onClick={handleImportPaste}
                          disabled={pasteImporting || !pasteInput.trim()}
                          className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
                        >
                          {pasteImporting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Import en cours...
                            </>
                          ) : (
                            "Importer les matchs"
                          )}
                        </Button>
                      </div>


                      <Button
                        onClick={() => {
                          setPouleUrlEditing(true);
                          setPouleSaveError(null);
                        }}
                        variant="outline"
                        className="w-full"
                      >
                        Changer de poule
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="poule-url-input">URL de la page de poule (ou triplet manuel)</Label>
                      <Input
                        id="poule-url-input"
                        placeholder="https://flandres.fff.fr/...&id=457587&phase=1&poule=4"
                        value={pouleUrlInput}
                        onChange={(e) => {
                          setPouleUrlInput(e.target.value);
                          setPouleSaveError(null);
                        }}
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground">
                        Collez l&apos;URL de la page de votre poule sur le site du district
                        (ex. <code>flandres.fff.fr</code>), ou saisissez directement le triplet{" "}
                        <code>cpNo/phase/poule</code>.
                      </p>
                      {pouleSaveError && (
                        <p role="alert" className="text-xs text-destructive">
                          {pouleSaveError}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPouleDialogOpen(false)}
                      className="flex-1"
                    >
                      Fermer
                    </Button>
                    {selected && (selected.dofa_cp_no == null || pouleUrlEditing) && (
                      <Button
                        onClick={handleSavePouleUrl}
                        disabled={pouleSaving || !pouleUrlInput.trim()}
                        className="flex-1 bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
                      >
                        {pouleSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement...
                          </>
                        ) : (
                          "Enregistrer"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

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

      {/* Résultat du dernier import DOFA */}
      {lastImportResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-[var(--color-gold)]" />
              Résultat du dernier import
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-xs"
                onClick={dismissLastImportResult}
              >
                Masquer
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{lastImportResult.imported} match(s) importé(s)</Badge>
              <Badge variant="outline">{lastImportResult.updated} mis à jour</Badge>
              <Badge variant="outline">{lastImportResult.skipped} ignoré(s)</Badge>
            </div>

            {lastImportResult.imported === 0 &&
              lastImportResult.updated === 0 &&
              lastImportResult.skipped === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucun nouveau match : le calendrier est déjà à jour pour cette poule.
                </p>
              )}

            {/* Réinitialisation des convocations : le plus lourd de conséquences,
                doit être très visible (pas seulement une couleur — texte explicite). */}
            {lastImportResult.eventSync.rescheduledResetAttendances > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-100"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  <strong>{lastImportResult.eventSync.rescheduledResetAttendances} match(s) décalé(s)</strong> :
                  les convocations existantes ont été réinitialisées, les joueurs seront à nouveau
                  sollicités pour ces matchs.
                </p>
              </div>
            )}

            {/* Conflits et verrouillages : situations nécessitant l'arbitrage du coach. */}
            {(lastImportResult.eventSync.conflict > 0 || lastImportResult.eventSync.skippedLocked > 0) && (
              <div className="space-y-2">
                {lastImportResult.eventSync.conflict > 0 && (
                  <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/40 dark:border-orange-800 p-3 text-sm text-orange-900 dark:text-orange-100">
                    <strong>{lastImportResult.eventSync.conflict} événement(s) modifié(s) manuellement</strong> :
                    l&apos;import ne les a pas écrasés. Vérifiez-les et mettez-les à jour vous-même si besoin.
                  </div>
                )}
                {lastImportResult.eventSync.skippedLocked > 0 && (
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                    <strong className="text-foreground">
                      {lastImportResult.eventSync.skippedLocked} événement(s) passé(s), verrouillé(s)
                    </strong>{" "}
                    : non modifiés par l&apos;import.
                  </div>
                )}
              </div>
            )}

            {lastImportResult.eventSync.errors > 0 && (
              <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {lastImportResult.eventSync.errors} erreur(s) technique(s) pendant la synchronisation de
                l&apos;agenda. Consultez les logs serveur si des matchs semblent manquants.
              </div>
            )}
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
                ? "Commencez par « Nouveau championnat », puis configurez la poule via « Import DOFA »."
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
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <Medal className="h-4 w-4" />
                  Classement — {selected.name}
                  {sortedTeams.length > 0 && (
                    // 🔒 Le service officiel DOFA (fetchPouleClassement) est
                    // structurellement bloqué en production (403 Akamai,
                    // cf. api/championships/dofa/route.ts) : tant qu'il ne
                    // répond pas, le classement affiché est TOUJOURS déduit
                    // des résultats saisis, jamais l'officiel FFF. Le coach
                    // doit le savoir explicitement.
                    <Badge
                      variant="outline"
                      className="ml-auto text-xs"
                      title="Le classement officiel FFF n'est pas encore accessible (service bloqué côté FFF) : ce classement est calculé à partir des résultats saisis."
                    >
                      Classement calculé
                    </Badge>
                  )}
                  {isCoach && selected.dofa_cp_no == null && (
                    <Badge variant="outline" className="text-xs">
                      Poule DOFA non configurée
                    </Badge>
                  )}
                  {isCoach && selected.dofa_cp_no != null && selected.dofa_cl_no == null && (
                    <Badge
                      variant="outline"
                      className="text-xs border-amber-400 text-amber-800 dark:text-amber-200"
                      title="L'agenda ne peut pas être alimenté automatiquement tant que vous n'avez pas choisi votre équipe (bouton « Import DOFA »)."
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
