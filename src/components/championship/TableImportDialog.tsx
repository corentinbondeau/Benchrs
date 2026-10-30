"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ClipboardList, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { parseMatchTable, type ParsedMatchRow } from "@/lib/championships/parse-table";

// ── Types ─────────────────────────────────────────────────────────────────

export interface TableImportDialogProps {
  championshipId: string;
  existingTeams: { team_name: string; cl_no: number; number: number }[];
  onImported: () => void;
}

/** Match parsé enrichi avec la résolution des équipes. */
interface ResolvedMatch extends ParsedMatchRow {
  /** Équipe domicile résolue dans la liste connue. */
  homeResolved: { team_name: string; cl_no: number; number: number } | null;
  /** Équipe extérieure résolue dans la liste connue. */
  awayResolved: { team_name: string; cl_no: number; number: number } | null;
  /** Match déjà présent → true si score absent, false si présent (à mettre à jour). */
  isDuplicate?: boolean;
}

// ── Helpers de matching ───────────────────────────────────────────────────

/** Normalise pour comparaison : minuscules + sans accents + collapse whitespace. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distance de Levenshtein simplifiée (limitée aux chaînes courtes). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Résout un nom d'équipe contre la liste des équipes connues.
 * Cherche d'abord une correspondance exacte (normalisée), puis la
 * correspondance la plus proche par Levenshtein si le score est acceptable.
 */
function resolveTeam(
  name: string,
  teams: { team_name: string; cl_no: number; number: number }[]
): { team_name: string; cl_no: number; number: number } | null {
  if (!teams.length) return null;
  const norm = normalize(name);

  // 1. Correspondance exacte
  const exact = teams.find((t) => normalize(t.team_name) === norm);
  if (exact) return exact;

  // 2. Correspondance partielle (le nom parsé est contenu dans le nom officiel ou vice-versa)
  const partial = teams.find(
    (t) => normalize(t.team_name).includes(norm) || norm.includes(normalize(t.team_name))
  );
  if (partial) return partial;

  // 3. Levenshtein — accepté si distance < 30 % de la longueur du nom le plus court
  let best: { team: (typeof teams)[number]; dist: number } | null = null;
  for (const t of teams) {
    const d = levenshtein(norm, normalize(t.team_name));
    if (!best || d < best.dist) best = { team: t, dist: d };
  }
  if (best) {
    const threshold = Math.max(3, Math.floor(Math.min(norm.length, normalize(best.team.team_name).length) * 0.3));
    if (best.dist <= threshold) return best.team;
  }

  return null;
}

// ── Placeholder ───────────────────────────────────────────────────────────

const PLACEHOLDER = `Collez votre tableau ici. Formats acceptés :

• Excel / Google Sheets (Tab) :
  Équipe A\t2\t1\tÉquipe B
  J5\tÉquipe A\t2\t1\tÉquipe B

• Score avec tiret :
  Équipe A 2-1 Équipe B
  Équipe A 2 - 1 Équipe B

• CSV (;  ou  ,) :
  Équipe A;2;1;Équipe B

• Avec date :
  06/09/2026\tÉquipe A\t2\t1\tÉquipe B

Les en-têtes et lignes vides sont ignorées automatiquement.
Les matchs sans score (à venir) sont acceptés.`;

// ── Composant principal ───────────────────────────────────────────────────

export function TableImportDialog({
  championshipId,
  existingTeams,
  onImported,
}: TableImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [resolved, setResolved] = useState<ResolvedMatch[] | null>(null);
  const [parseErrors, setParseErrors] = useState<{ line: number; raw: string; reason: string }[]>([]);
  const [formatDetected, setFormatDetected] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setRawText("");
    setResolved(null);
    setParseErrors([]);
    setFormatDetected("");
    setImporting(false);
    setImportProgress(null);
  }

  function handleAnalyse() {
    const result = parseMatchTable(rawText);
    setParseErrors(result.errors);
    setFormatDetected(
      result.format === "tab" ? "Tab-séparé (Excel / Google Sheets)" :
      result.format === "csv" ? "CSV (;  ou  ,)" :
      result.format === "dash" ? "Score avec tiret" :
      "Format non détecté"
    );

    const rows: ResolvedMatch[] = result.matches.map((m) => ({
      ...m,
      homeResolved: resolveTeam(m.homeTeam, existingTeams),
      awayResolved: resolveTeam(m.awayTeam, existingTeams),
    }));

    setResolved(rows);
  }

  /** Retourne le nombre de matchs importables (les deux équipes résolues). */
  function importableCount(): number {
    if (!resolved) return 0;
    return resolved.filter((r) => r.homeResolved && r.awayResolved).length;
  }

  async function handleImport() {
    if (!resolved) return;
    const toImport = resolved.filter((r) => r.homeResolved && r.awayResolved);
    if (!toImport.length) {
      toast.error("Aucun match importable (équipes non résolues).");
      return;
    }

    setImporting(true);
    setImportProgress({ done: 0, total: toImport.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < toImport.length; i++) {
      const m = toImport[i];
      const home = m.homeResolved!;
      const away = m.awayResolved!;

      try {
        const res = await authFetch("/api/championships/standings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            championship_id: championshipId,
            home_team: home.team_name,
            away_team: away.team_name,
            home_cl_no: home.cl_no,
            home_team_number: home.number,
            away_cl_no: away.cl_no,
            away_team_number: away.number,
            home_score: m.homeScore,
            away_score: m.awayScore,
            matchday_number: m.matchday ?? null,
            source: "manual",
          }),
        });

        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json().catch(() => ({}));
          console.warn(`[TableImport] Erreur match ${i + 1}:`, data.error);
          errorCount++;
        }
      } catch (err) {
        console.error(`[TableImport] Exception match ${i + 1}:`, err);
        errorCount++;
      }

      setImportProgress({ done: i + 1, total: toImport.length });
    }

    setImporting(false);

    if (successCount > 0 && errorCount === 0) {
      toast.success(`${successCount} match${successCount > 1 ? "s" : ""} importé${successCount > 1 ? "s" : ""} avec succès.`);
    } else if (successCount > 0) {
      toast.warning(`${successCount} match${successCount > 1 ? "s" : ""} importé${successCount > 1 ? "s" : ""}, ${errorCount} erreur${errorCount > 1 ? "s" : ""}.`);
    } else {
      toast.error("Aucun match n'a pu être importé. Vérifiez les données.");
      return;
    }

    onImported();
    setOpen(false);
    reset();
  }

  // ── Rendu ──────────────────────────────────────────────────────────────

  const importable = importableCount();
  const unresolvable = resolved ? resolved.filter((r) => !r.homeResolved || !r.awayResolved).length : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <ClipboardList className="h-4 w-4 mr-1" />
        Coller des résultats
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Importer des résultats par collage
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Zone de saisie */}
          {!resolved && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Copiez un tableau de résultats depuis Excel, Google Sheets, un site web ou un PDF,
                puis collez-le ci-dessous.
              </p>
              <textarea
                ref={textareaRef}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono min-h-[200px] focus:outline-none focus:ring-2 focus:ring-ring resize-y placeholder:text-muted-foreground"
                placeholder={PLACEHOLDER}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                spellCheck={false}
              />
              <Button
                onClick={handleAnalyse}
                disabled={!rawText.trim()}
                className="w-full"
              >
                Analyser le tableau
              </Button>
            </div>
          )}

          {/* Aperçu des résultats parsés */}
          {resolved && (
            <div className="space-y-3">
              {/* Bandeau info format */}
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  Format détecté : <strong>{formatDetected}</strong>
                  {" · "}
                  {resolved.length} match{resolved.length > 1 ? "s" : ""} trouvé{resolved.length > 1 ? "s" : ""}
                  {parseErrors.length > 0 && (
                    <> · <span className="text-amber-600">{parseErrors.length} ligne{parseErrors.length > 1 ? "s" : ""} ignorée{parseErrors.length > 1 ? "s" : ""}</span></>
                  )}
                </span>
              </div>

              {/* Avertissement équipes non résolues */}
              {unresolvable > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>{unresolvable} match{unresolvable > 1 ? "s" : ""}</strong> ne peuvent pas être importés car certaines équipes ne correspondent à aucune équipe connue de la poule.
                    Ces lignes sont marquées <XCircle className="inline h-3 w-3 mx-0.5 text-destructive" /> en rouge.
                  </span>
                </div>
              )}

              {/* Avertissement liste d'équipes vide */}
              {existingTeams.length === 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>
                    Aucune équipe n&apos;est encore connue pour cette poule. Les noms seront utilisés tels quels mais les scores ne pourront pas contribuer au classement.
                  </span>
                </div>
              )}

              {/* Tableau d'aperçu */}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 text-center">J</TableHead>
                      <TableHead>Domicile</TableHead>
                      <TableHead className="w-16 text-center">Score</TableHead>
                      <TableHead>Extérieur</TableHead>
                      <TableHead className="w-8 text-center"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resolved.map((m, idx) => {
                      const ok = !!m.homeResolved && !!m.awayResolved;
                      return (
                        <TableRow
                          key={idx}
                          className={!ok ? "bg-destructive/5" : undefined}
                        >
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {m.matchday ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className={!m.homeResolved ? "text-destructive" : ""}>
                              {m.homeTeam}
                            </span>
                            {m.homeResolved && m.homeResolved.team_name !== m.homeTeam && (
                              <span className="block text-xs text-muted-foreground">
                                → {m.homeResolved.team_name}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm font-semibold whitespace-nowrap">
                            {m.homeScore !== null && m.awayScore !== null
                              ? `${m.homeScore} - ${m.awayScore}`
                              : <Badge variant="outline" className="text-xs font-normal">À venir</Badge>}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className={!m.awayResolved ? "text-destructive" : ""}>
                              {m.awayTeam}
                            </span>
                            {m.awayResolved && m.awayResolved.team_name !== m.awayTeam && (
                              <span className="block text-xs text-muted-foreground">
                                → {m.awayResolved.team_name}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {ok
                              ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                              : <XCircle className="h-4 w-4 text-destructive mx-auto" />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Lignes ignorées */}
              {parseErrors.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer text-amber-600 dark:text-amber-400 hover:underline">
                    {parseErrors.length} ligne{parseErrors.length > 1 ? "s" : ""} ignorée{parseErrors.length > 1 ? "s" : ""} (format non reconnu)
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono pl-4">
                    {parseErrors.map((e) => (
                      <li key={e.line} className="truncate">
                        <span className="text-muted-foreground">L{e.line} :</span>{" "}
                        <span className="italic">{e.raw}</span>
                        <span className="text-amber-600"> — {e.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Barre de progression */}
              {importing && importProgress && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Import en cours…</span>
                    <span>{importProgress.done}/{importProgress.total}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setResolved(null); setParseErrors([]); setFormatDetected(""); }}
                  disabled={importing}
                  className="flex-1"
                >
                  ← Corriger
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing || importable === 0}
                  className="flex-1 bg-[var(--color-primary-blue)] text-white font-semibold hover:bg-[var(--color-primary-blue)]/90"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Import en cours…
                    </>
                  ) : (
                    <>Importer {importable} match{importable > 1 ? "s" : ""}</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
