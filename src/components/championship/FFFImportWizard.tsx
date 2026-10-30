"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Search, Trophy, ChevronRight, CheckCircle2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { parseDofaMatches } from "@/lib/dofa/parse-matches";
import { hasUsableDate } from "@/lib/dofa/parse-matches";
import {
  fetchClubTeams,
  searchClubByName,
  fetchAllPouleMatches,
  fetchPouleStandings,
  type ClubTeam,
  type ClubEngagement,
  type ClubInfo,
} from "@/lib/dofa/browser-client";

// ─── Types ────────────────────────────────────────────────────────────────

interface FFFImportWizardProps {
  /** ID de l'équipe Benchrs (pour la route d'ingestion) */
  teamId: string;
  /** Appelé après un import réussi pour recharger la liste */
  onImported: () => void;
  /** Championnat pré-sélectionné (cpNo/phase/poule) — optionnel */
  preselectedChampionshipId?: string;
  /** Pour pré-remplir le numéro de club */
  defaultClNo?: number;
}

type WizardStep = "club" | "competition" | "import";

interface SelectedCompetition {
  team: ClubTeam;
  engagement: ClubEngagement;
}

interface ImportSummary {
  total: number;
  withScores: number;
  upcoming: number;
  undated: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function competitionTypeLabel(type: string): string {
  switch (type?.toLowerCase()) {
    case "ch": return "Championnat";
    case "co": return "Coupe";
    case "cp": return "Coupe";
    default: return "Compétition";
  }
}

function competitionTypeBadgeClass(type: string): string {
  switch (type?.toLowerCase()) {
    case "ch": return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700";
    case "co":
    case "cp": return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700";
    default: return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700";
  }
}

/** Regroupe les équipes par catégorie */
function groupByCategory(teams: ClubTeam[]): Map<string, ClubTeam[]> {
  const map = new Map<string, ClubTeam[]>();
  for (const team of teams) {
    const key = team.categoryLabel || team.categoryCode || "Autre";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(team);
  }
  return map;
}

// ─── Sous-composants ──────────────────────────────────────────────────────

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-[var(--color-primary-blue)] rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: WizardStep }) {
  const steps: { id: WizardStep; label: string }[] = [
    { id: "club", label: "Club" },
    { id: "competition", label: "Compétition" },
    { id: "import", label: "Import" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);

  return (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
              idx < currentIdx
                ? "bg-green-500 text-white"
                : idx === currentIdx
                ? "bg-[var(--color-primary-blue)] text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {idx < currentIdx ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
          </div>
          <span
            className={`text-xs font-medium ${
              idx === currentIdx ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {step.label}
          </span>
          {idx < steps.length - 1 && (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Étape 1 — Recherche du club ──────────────────────────────────────────

function StepClub({
  defaultClNo,
  onFound,
}: {
  defaultClNo?: number;
  onFound: (clubInfo: ClubInfo, teams: ClubTeam[]) => void;
}) {
  const [searchInput, setSearchInput] = useState(defaultClNo ? String(defaultClNo) : "");
  const [searchMode, setSearchMode] = useState<"number" | "name">("number");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<ClubInfo[] | null>(null);

  function handleError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("502") || msg.includes("indisponible") || msg.includes("injoignable")) {
      setError(
        "L'API de la FFF est temporairement indisponible — la FFF coupe régulièrement son API sans prévenir. " +
          "Réessayez dans quelques heures ou demain."
      );
    } else if (msg.includes("Aucun club")) {
      setError(msg);
    } else if (msg.includes("403") || msg.includes("Failed to fetch")) {
      setError("L'API de la FFF bloque les requêtes. Réessayez plus tard.");
    } else {
      setError(`Impossible de contacter l'API FFF (${msg}). Vérifiez votre connexion ou réessayez plus tard.`);
    }
  }

  async function handleSearchByNumber() {
    const num = parseInt(searchInput.trim(), 10);
    if (isNaN(num) || num <= 0) {
      setError("Entrez un numéro de club valide.");
      return;
    }
    setError(null);
    setSearchResults(null);
    setLoading(true);
    try {
      const { clubInfo, teams } = await fetchClubTeams(num);
      if (teams.length === 0) {
        setError(`Club « ${clubInfo.name} » trouvé mais aucune équipe engagée cette saison.`);
        return;
      }
      onFound(clubInfo, teams);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchByName() {
    const q = searchInput.trim();
    if (q.length < 2) {
      setError("Entrez au moins 2 caractères.");
      return;
    }
    setError(null);
    setSearchResults(null);
    setLoading(true);
    try {
      const results = await searchClubByName(q);
      if (results.length === 0) {
        setError(`Aucun club trouvé pour « ${q} ». Essayez avec le numéro d'affiliation.`);
        return;
      }
      setSearchResults(results);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectClub(club: ClubInfo) {
    setError(null);
    setSearchResults(null);
    setLoading(true);
    try {
      const { clubInfo, teams } = await fetchClubTeams(club.clNo);
      if (teams.length === 0) {
        setError(`Club « ${clubInfo.name} » trouvé mais aucune équipe engagée cette saison.`);
        return;
      }
      onFound(clubInfo, teams);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    if (searchMode === "name") {
      handleSearchByName();
    } else {
      handleSearchByNumber();
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2 mb-2">
          <Button
            variant={searchMode === "number" ? "secondary" : "outline"}
            size="sm"
            onClick={() => { setSearchMode("number"); setSearchResults(null); setError(null); }}
          >
            Par numéro
          </Button>
          <Button
            variant={searchMode === "name" ? "secondary" : "outline"}
            size="sm"
            onClick={() => { setSearchMode("name"); setSearchResults(null); setError(null); }}
          >
            Par nom
          </Button>
        </div>

        <Label htmlFor="fff-club-search">
          {searchMode === "number" ? "Numéro de club ou d'affiliation FFF" : "Nom du club"}
        </Label>
        {searchMode === "number" && (
          <p className="text-xs text-muted-foreground">
            Accepte le numéro d'affiliation (ex: <code className="bg-muted px-1 rounded">525816</code>)
            ou le numéro interne FFF (ex: <code className="bg-muted px-1 rounded">10428</code>)
          </p>
        )}
        <div className="flex gap-2">
          <Input
            id="fff-club-search"
            type={searchMode === "number" ? "number" : "text"}
            min={searchMode === "number" ? "1" : undefined}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={searchMode === "number" ? "Ex. 525816" : "Ex. Camphin"}
            className="flex-1"
            disabled={loading}
          />
          <Button onClick={handleSearch} disabled={loading || !searchInput.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1.5">Rechercher</span>
          </Button>
        </div>
      </div>

      {/* Résultats de recherche par nom */}
      {searchResults && searchResults.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{searchResults.length} club(s) trouvé(s) :</p>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {searchResults.map((club) => (
              <button
                key={club.clNo}
                onClick={() => handleSelectClub(club)}
                disabled={loading}
                className="w-full text-left flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition text-sm"
              >
                <div>
                  <p className="font-medium">{club.name}</p>
                  <p className="text-xs text-muted-foreground">{club.shortName}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  n°{club.clNo}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Comment trouver mon numéro de club ?</p>
        <p>
          Votre numéro d'affiliation FFF (6 chiffres, ex: 525816) se trouve sur votre licence
          ou sur le site de votre district. Vous pouvez aussi chercher par nom ci-dessus.
        </p>
      </div>
    </div>
  );
}

// ─── Étape 2 — Choix de la compétition ────────────────────────────────────

function StepCompetition({
  clNo,
  teams,
  onSelected,
  onBack,
}: {
  clNo: number;
  teams: ClubTeam[];
  onSelected: (selection: SelectedCompetition) => void;
  onBack: () => void;
}) {
  const grouped = groupByCategory(teams);
  const hasEngagements = teams.some((t) => t.engagements.length > 0);

  if (!hasEngagements) {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Aucun engagement trouvé pour le club <strong>{clNo}</strong>. Il se peut que
            la saison n'ait pas encore démarré ou que le numéro soit incorrect.
          </p>
        </div>
        <Button variant="outline" onClick={onBack} className="w-full">
          ← Changer de numéro de club
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Club <strong>{clNo}</strong> · {teams.length} équipe{teams.length > 1 ? "s" : ""} trouvée
        {teams.length > 1 ? "s" : ""}. Cliquez sur la compétition à importer.
      </p>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {Array.from(grouped.entries()).map(([category, categoryTeams]) => (
          <div key={category} className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
              {category}
            </p>
            {categoryTeams.map((team) =>
              team.engagements.map((eng) => (
                <button
                  key={`${team.number}-${eng.cpNo}-${eng.phase}-${eng.poule}`}
                  onClick={() => onSelected({ team, engagement: eng })}
                  className="w-full text-left rounded-lg border bg-card hover:bg-muted/50 transition-colors p-3 space-y-1.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium ${competitionTypeBadgeClass(eng.competitionType)}`}
                    >
                      {competitionTypeLabel(eng.competitionType)}
                    </span>
                    {eng.pouleName && (
                      <span className="text-xs text-muted-foreground">{eng.pouleName}</span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-tight">{eng.competitionName}</p>
                  <p className="text-xs text-muted-foreground">
                    Compét. {eng.cpNo} · phase {eng.phase} · poule {eng.poule}
                  </p>
                </button>
              ))
            )}
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={onBack} className="mt-1">
        ← Changer de club
      </Button>
    </div>
  );
}

// ─── Étape 3 — Import automatique ─────────────────────────────────────────

function StepImport({
  teamId,
  clNo,
  selection,
  onBack,
  onDone,
}: {
  teamId: string;
  clNo: number;
  selection: SelectedCompetition;
  onBack: () => void;
  onDone: () => void;
}) {
  const { engagement } = selection;

  const [phase, setPhase] = useState<"idle" | "fetching" | "preview" | "posting" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parsedMatches, setParsedMatches] = useState<ReturnType<typeof parseDofaMatches>>([]);
  const [officialStandings, setOfficialStandings] = useState<unknown[] | null>(null);
  const rawMatchesRef = useRef<unknown[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    eventSync: { created: number; updated: number };
  } | null>(null);

  const handleFetch = useCallback(async () => {
    setPhase("fetching");
    setProgress(5);
    setProgressLabel("Connexion à l'API FFF…");
    setErrorMsg(null);

    try {
      // Fetch matches avec pagination
      const rawMatches = await fetchAllPouleMatches(
        engagement.cpNo,
        engagement.phase,
        engagement.poule,
        (pageIdx, total) => {
          // Progression heuristique : on ne connaît pas le nombre total de pages
          const estimatedProgress = Math.min(85, 5 + pageIdx * 20);
          setProgress(estimatedProgress);
          setProgressLabel(`Page ${pageIdx} chargée — ${total} match${total > 1 ? "s" : ""} trouvé${total > 1 ? "s" : ""}…`);
        }
      );

      setProgress(90);
      setProgressLabel("Chargement du classement officiel…");

      // Fetch classement (optionnel, on ne bloque pas si ça échoue)
      let standings: unknown[] | null = null;
      try {
        standings = await fetchPouleStandings(engagement.cpNo, engagement.phase, engagement.poule);
        setOfficialStandings(standings);
      } catch {
        // Non bloquant
      }

      setProgress(95);
      setProgressLabel("Analyse des matchs…");

      // Stocker les matchs bruts pour l'envoi à la route d'ingestion
      rawMatchesRef.current = rawMatches;

      // Parser les matchs pour l'aperçu
      const matches = parseDofaMatches(rawMatches);
      const withScores = matches.filter(
        (m) => m.homeScore !== null && m.awayScore !== null
      ).length;
      const upcoming = matches.filter(
        (m) => m.homeScore === null && m.awayScore === null && hasUsableDate(m)
      ).length;
      const undated = matches.filter((m) => !hasUsableDate(m)).length;

      setParsedMatches(matches);
      setSummary({
        total: matches.length,
        withScores,
        upcoming,
        undated,
      });
      setProgress(100);
      setPhase("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPhase("error");
      if (msg.includes("DOFA 403") || msg.includes("Failed to fetch") || msg.includes("CORS")) {
        setErrorMsg(
          "L'API FFF a bloqué la requête (CORS ou protection Akamai). " +
            "Utilisez le bouton « Import DOFA » classique (copier-coller) à la place."
        );
      } else {
        setErrorMsg(`Erreur lors du chargement des matchs : ${msg}`);
      }
    }
  }, [engagement]);

  async function handleImport() {
    if (!parsedMatches.length) {
      toast.error("Aucun match à importer.");
      return;
    }
    setPhase("posting");

    try {
      // 1. Créer le championnat s'il n'existe pas encore
      const createRes = await authFetch("/api/championships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: engagement.competitionName,
          season: String(new Date().getFullYear()),
          level: engagement.competitionType === "CH" || engagement.competitionType === "ch" ? "District" : null,
          team_id: teamId,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        // Ignorer si le championnat existe déjà
        if (!err?.error?.includes("existe")) {
          setErrorMsg(err?.error || "Erreur lors de la création du championnat.");
          setPhase("error");
          return;
        }
      }
      const championship = createRes.ok ? await createRes.json() : null;

      // 2. Configurer la poule DOFA sur le championnat
      if (championship?.id) {
        await authFetch("/api/championships", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: championship.id,
            cpNo: engagement.cpNo,
            phase: engagement.phase,
            poule: engagement.poule,
          }),
        });
      }

      // 3. Ingérer les matchs
      const res = await authFetch("/api/championships/dofa/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          cpNo: engagement.cpNo,
          phase: engagement.phase,
          poule: engagement.poule,
          matches: rawMatchesRef.current,
          officialStandings: officialStandings ?? undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400 && data?.error?.includes("Championnat introuvable")) {
          setErrorMsg(
            "Aucun championnat Benchrs n'est encore associé à cette poule FFF. " +
              "Créez d'abord un championnat, puis configurez-lui la poule DOFA via « Import DOFA »."
          );
        } else if (res.status === 429) {
          setErrorMsg(
            "Un import a été effectué il y a moins de 60 secondes. Réessayez dans un instant."
          );
        } else {
          setErrorMsg(data?.error || "Le serveur a refusé l'import. Réessayez.");
        }
        setPhase("error");
        return;
      }

      setImportResult(data);
      setPhase("done");
      toast.success(
        `Import terminé : ${data.imported} nouveaux matchs, ${data.updated} mis à jour.`
      );
      onDone();
    } catch {
      setErrorMsg("Impossible de contacter le serveur Benchrs. Vérifiez votre connexion.");
      setPhase("error");
    }
  }

  // Idle — bouton de démarrage
  if (phase === "idle") {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-[var(--color-primary-blue)]" />
              <span className="text-sm font-medium">{engagement.competitionName}</span>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Phase {engagement.phase} · Poule {engagement.poule}
              {engagement.pouleName ? ` · ${engagement.pouleName}` : ""}
            </p>
            <div className="pl-6">
              <span
                className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium ${competitionTypeBadgeClass(engagement.competitionType)}`}
              >
                {competitionTypeLabel(engagement.competitionType)}
              </span>
            </div>
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Benchrs va charger tous les matchs de cette poule automatiquement depuis l'API FFF
          (plusieurs pages si nécessaire).
        </p>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} className="flex-1">
            ← Retour
          </Button>
          <Button onClick={handleFetch} className="flex-1 bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Charger les matchs
          </Button>
        </div>
      </div>
    );
  }

  // Fetching — progress bar
  if (phase === "fetching") {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm font-medium">Chargement en cours…</p>
        <ProgressBar value={progress} label={progressLabel} />
        <p className="text-xs text-muted-foreground">
          L'API FFF peut prendre quelques secondes. Ne fermez pas cette fenêtre.
        </p>
      </div>
    );
  }

  // Preview — résumé avant import
  if (phase === "preview" && summary) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-green-50 dark:bg-green-950/30 p-4 space-y-2">
          <p className="text-sm font-semibold text-green-900 dark:text-green-100">
            {summary.total} match{summary.total > 1 ? "s" : ""} trouvé{summary.total > 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-2">
              <p className="text-lg font-bold text-green-700 dark:text-green-300">
                {summary.withScores}
              </p>
              <p className="text-xs text-muted-foreground">Avec scores</p>
            </div>
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-2">
              <p className="text-lg font-bold text-blue-600 dark:text-blue-300">
                {summary.upcoming}
              </p>
              <p className="text-xs text-muted-foreground">À venir</p>
            </div>
            <div className="rounded-md bg-white dark:bg-green-900/30 border border-green-200 dark:border-green-700 p-2">
              <p className="text-lg font-bold text-amber-600 dark:text-amber-300">
                {summary.undated}
              </p>
              <p className="text-xs text-muted-foreground">Sans date</p>
            </div>
          </div>
          {summary.undated > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ Les {summary.undated} match{summary.undated > 1 ? "s" : ""} sans date seront importés
              au classement mais n'apparaîtront pas dans l'agenda (date non publiée par la FFF).
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} className="flex-1">
            ← Annuler
          </Button>
          <Button
            onClick={handleImport}
            className="flex-1 bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90"
          >
            Importer dans Benchrs
          </Button>
        </div>
      </div>
    );
  }

  // Posting
  if (phase === "posting") {
    return (
      <div className="space-y-4 py-2">
        <p className="text-sm font-medium">Enregistrement en cours…</p>
        <ProgressBar value={70} label="Envoi des matchs au serveur Benchrs…" />
      </div>
    );
  }

  // Done
  if (phase === "done" && importResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-green-900 dark:text-green-100">Import réussi !</p>
            <p className="text-green-800 dark:text-green-200">
              {importResult.imported} nouveau{importResult.imported > 1 ? "x" : ""} match
              {importResult.imported > 1 ? "s" : ""} importé{importResult.imported > 1 ? "s" : ""}.
              {importResult.updated > 0
                ? ` ${importResult.updated} match${importResult.updated > 1 ? "s" : ""} mis à jour.`
                : ""}
            </p>
            {(importResult.eventSync.created > 0 || importResult.eventSync.updated > 0) && (
              <p className="text-green-700 dark:text-green-300">
                Agenda :{" "}
                {importResult.eventSync.created > 0
                  ? `${importResult.eventSync.created} événement${importResult.eventSync.created > 1 ? "s" : ""} créé${importResult.eventSync.created > 1 ? "s" : ""}`
                  : ""}
                {importResult.eventSync.created > 0 && importResult.eventSync.updated > 0 ? ", " : ""}
                {importResult.eventSync.updated > 0
                  ? `${importResult.eventSync.updated} mis à jour`
                  : ""}
                .
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (phase === "error") {
    return (
      <div className="space-y-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack} className="flex-1">
            ← Retour
          </Button>
          {phase === "error" && parsedMatches.length === 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setPhase("idle");
                setErrorMsg(null);
              }}
              className="flex-1"
            >
              Réessayer
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Composant principal ───────────────────────────────────────────────────

export function FFFImportWizard({
  teamId,
  onImported,
  defaultClNo,
}: FFFImportWizardProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("club");
  const [clNo, setClNo] = useState<number | null>(defaultClNo ?? null);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [selection, setSelection] = useState<SelectedCompetition | null>(null);

  function resetWizard() {
    setStep("club");
    setClNo(defaultClNo ?? null);
    setTeams([]);
    setSelection(null);
  }

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen);
    if (!isOpen) {
      // Reset léger au cas où on re-ouvre plus tard
      // On garde clNo pour éviter de re-saisir
    }
  }

  function handleClubFound(clubInfo: ClubInfo, foundTeams: ClubTeam[]) {
    setClNo(clubInfo.clNo);
    setTeams(foundTeams);
    setStep("competition");
  }

  function handleCompetitionSelected(sel: SelectedCompetition) {
    setSelection(sel);
    setStep("import");
  }

  function handleImportDone() {
    onImported();
    // On garde le dialog ouvert pour afficher le résultat
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90" />
        }
      >
        <Sparkles className="h-4 w-4 mr-1" />
        Importer depuis la FFF
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg w-full">
        <DialogHeader>
          <DialogTitle>Import FFF — Wizard</DialogTitle>
        </DialogHeader>

        <StepIndicator current={step} />

        {step === "club" && (
          <StepClub
            defaultClNo={defaultClNo}
            onFound={handleClubFound}
          />
        )}

        {step === "competition" && clNo && teams.length > 0 && (
          <StepCompetition
            clNo={clNo}
            teams={teams}
            onSelected={handleCompetitionSelected}
            onBack={() => setStep("club")}
          />
        )}

        {step === "import" && clNo && selection && (
          <StepImport
            teamId={teamId}
            clNo={clNo}
            selection={selection}
            onBack={() => setStep("competition")}
            onDone={handleImportDone}
          />
        )}

        {/* Bouton reset en bas pour recommencer */}
        {step !== "club" && (
          <button
            onClick={resetWizard}
            className="mt-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground text-center w-full"
          >
            Recommencer depuis le début
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
