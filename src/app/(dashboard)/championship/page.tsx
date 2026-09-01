"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, Plus, Loader2, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { parsePouleUrl } from "@/lib/dofa/poule-url";
import { DOFA_IMPORT_RESULT_STORAGE_KEY, type DofaImportResult } from "@/lib/dofa/import-result-storage";

interface Championship {
  id: string;
  name: string;
  season: string;
  level: string | null;
  teams: ChampionshipTeam[];
  dofa_cp_no?: number | null;
  dofa_phase?: number | null;
  dofa_poule?: number | null;
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

  // Import DOFA — saisie/édition de l'URL de poule (LOT 10)
  const [pouleDialogOpen, setPouleDialogOpen] = useState(false);
  const [pouleUrlInput, setPouleUrlInput] = useState("");
  const [pouleUrlEditing, setPouleUrlEditing] = useState(false);
  const [pouleSaveError, setPouleSaveError] = useState<string | null>(null);
  const [pouleSaving, setPouleSaving] = useState(false);

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

  // Résultat du dernier import (relayé par la page de réception du
  // bookmarklet) : lu une seule fois via l'initialiseur paresseux de
  // `useState`, sans logique d'agrégation ni effet de bord au montage.
  const [lastImportResult, setLastImportResult] = useState<DofaImportResult | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(DOFA_IMPORT_RESULT_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as DofaImportResult) : null;
    } catch {
      return null;
    }
  });

  if (!currentTeam) return null;

  function dismissLastImportResult() {
    setLastImportResult(null);
    try {
      window.sessionStorage.removeItem(DOFA_IMPORT_RESULT_STORAGE_KEY);
    } catch {
      // pas bloquant
    }
  }

  // Enregistre (première fois) ou modifie (bouton « Changer de poule ») le
  // triplet DOFA du championnat actuellement sélectionné. `parsePouleUrl`
  // (lot 4, non modifié) donne un retour immédiat : une entrée invalide ne
  // déclenche même pas d'appel réseau.
  async function handleSavePouleUrl() {
    if (!selected) {
      setPouleSaveError("Sélectionnez ou créez d'abord un championnat (bouton « Import manuel »).");
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
      toast.success("Poule DOFA configurée. Utilisez le bookmarklet pour importer les matchs.");
    } catch {
      // 🔒 Distinct du message de validation ci-dessus : ceci est une panne
      // réseau/serveur, pas une saisie invalide.
      setPouleSaveError("Impossible de contacter le serveur Benchrs (connexion). Réessayez.");
    } finally {
      setPouleSaving(false);
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

  async function handleSaveMatches(matches: ScrapedMatch[] | null) {
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
      setManualOpen(false);
      resetFffDialog();
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
            {/* Dialog Import DOFA — saisie de l'URL de poule (LOT 10) */}
            <Dialog
              open={pouleDialogOpen}
              onOpenChange={(open) => {
                setPouleDialogOpen(open);
                if (!open) {
                  setPouleUrlEditing(false);
                  setPouleUrlInput("");
                  setPouleSaveError(null);
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
                      Créez d&apos;abord un championnat (bouton « Import manuel » ci-contre),
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

                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    L&apos;import des matchs se fait ensuite via le favori de navigateur généré
                    sur la page dédiée :{" "}
                    <Link
                      href="/championship/bookmarklet"
                      className="font-medium text-[var(--color-primary-blue)] hover:underline"
                    >
                      générer mon bookmarklet d&apos;import →
                    </Link>
                  </div>

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
                        className="w-full bg-[var(--color-primary-blue)] text-white font-semibold"
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
                          onClick={() => handleSaveMatches(scrapedMatches)}
                          disabled={saving || !importName.trim()}
                          className="flex-1 bg-[var(--color-primary-blue)] text-white font-semibold"
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

      {/* Résultat du dernier import DOFA (relayé depuis la page bookmarklet) */}
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
                ? "Commencez par « Import manuel », puis configurez la poule via « Import DOFA »."
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
                    // doit le savoir explicitement (cf. lot 10, règle d'or).
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
