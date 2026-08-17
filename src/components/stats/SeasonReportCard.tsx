"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarClock,
  Download,
  FileText,
  Loader2,
  PenLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { useTeam } from "@/lib/team";
import { currentSeasonLabel, previousSeasonLabel } from "@/lib/goals";
import type { SeasonReportContent } from "@/app/api/season/report/route";

function toPdfDataUrl(dataUrl: string): string {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

interface MeilleurJoueur {
  nom: string;
  raison: string;
}

interface Draft {
  title: string;
  summary: string;
  points_forts: string;
  points_faibles: string;
  axes_progression: string;
  note_equipe: number;
  meilleurs_joueurs: MeilleurJoueur[];
  meilleur_buteur: string;
  meilleure_passeur: string;
  joueur_plus_present: string;
}

function contentToDraft(report: SeasonReportContent): Draft {
  return {
    title: report.title,
    summary: report.summary,
    points_forts: report.points_forts.join("\n"),
    points_faibles: report.points_faibles.join("\n"),
    axes_progression: report.axes_progression.join("\n"),
    note_equipe: report.note_equipe,
    meilleurs_joueurs:
      report.meilleurs_joueurs.length > 0
        ? report.meilleurs_joueurs.map((m) => ({ nom: m.nom, raison: m.raison }))
        : [{ nom: "", raison: "" }],
    meilleur_buteur: report.meilleur_buteur ?? "",
    meilleure_passeur: report.meilleure_passeur ?? "",
    joueur_plus_present: report.joueur_plus_present ?? "",
  };
}

function draftToContent(draft: Draft): SeasonReportContent {
  const lines = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  return {
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    points_forts: lines(draft.points_forts),
    points_faibles: lines(draft.points_faibles),
    axes_progression: lines(draft.axes_progression),
    note_equipe: draft.note_equipe,
    meilleurs_joueurs: draft.meilleurs_joueurs.filter((m) => m.nom.trim()),
    meilleur_buteur: draft.meilleur_buteur.trim() || null,
    meilleure_passeur: draft.meilleure_passeur.trim() || null,
    joueur_plus_present: draft.joueur_plus_present.trim() || null,
  };
}

export function SeasonReportCard({ teamId, isCoach }: { teamId: string; isCoach: boolean }) {
  const seasonNow = currentSeasonLabel();
  const [seasons] = useState(() => {
    const s = [seasonNow];
    let prev = seasonNow;
    for (let i = 0; i < 2; i++) {
      prev = previousSeasonLabel(prev);
      s.push(prev);
    }
    return s;
  });
  const [season, setSeason] = useState(seasonNow);
  const [report, setReport] = useState<SeasonReportContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { currentTeam } = useTeam();
  const teamName = currentTeam?.name || "Équipe";

  const loadReport = useCallback(async () => {
    const res = await authFetch(`/api/season/report?teamId=${teamId}&season=${season}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Erreur");
    return data?.report as SeasonReportContent | null;
  }, [teamId, season]);

  useEffect(() => {
    let cancelled = false;
    loadReport()
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch(() => {
        if (!cancelled) setReport(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadReport]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await authFetch("/api/season/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, season }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setReport(data.report as SeasonReportContent);
      toast.success("Bilan de saison généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  function startEditing() {
    if (!report) return;
    setDraft(contentToDraft(report));
    setEditing(true);
  }

  async function saveManual() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Le titre du bilan est requis");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/season/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          season,
          mode: "manual",
          report: draftToContent(draft),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setReport(data.report as SeasonReportContent);
      setEditing(false);
      toast.success("Bilan de saison enregistré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function openPdf() {
    if (!report) return;
    setPdfLoading(true);
    try {
      const res = await authFetch("/api/season/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report, teamName, season }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      const url = toPdfDataUrl(data.pdf as string);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération du PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[var(--color-gold)]" />
            Bilan de saison
          </CardTitle>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                Saison {s}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && draft && isCoach ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Titre *</label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                placeholder="Bilan de la saison 2025-2026"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Résumé <span className="text-muted-foreground/60">(4 à 6 phrases)</span>
              </label>
              <Textarea
                value={draft.summary}
                onChange={(e) => setDraft((d) => (d ? { ...d, summary: e.target.value } : d))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Note de l&apos;équipe ({draft.note_equipe}/10)
              </label>
              <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDraft((d) => (d ? { ...d, note_equipe: i } : d))}
                    className={`h-8 w-full rounded-md text-xs font-bold transition-colors ${
                      i <= draft.note_equipe
                        ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Points forts <span className="text-muted-foreground/60">(une par ligne)</span>
              </label>
              <Textarea
                value={draft.points_forts}
                onChange={(e) => setDraft((d) => (d ? { ...d, points_forts: e.target.value } : d))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Points à améliorer <span className="text-muted-foreground/60">(une par ligne)</span>
              </label>
              <Textarea
                value={draft.points_faibles}
                onChange={(e) => setDraft((d) => (d ? { ...d, points_faibles: e.target.value } : d))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Axes de progression <span className="text-muted-foreground/60">(une par ligne)</span>
              </label>
              <Textarea
                value={draft.axes_progression}
                onChange={(e) => setDraft((d) => (d ? { ...d, axes_progression: e.target.value } : d))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Meilleur buteur</label>
                <Input
                  value={draft.meilleur_buteur}
                  onChange={(e) => setDraft((d) => (d ? { ...d, meilleur_buteur: e.target.value } : d))}
                  placeholder="Prénom Nom"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Meilleur passeur</label>
                <Input
                  value={draft.meilleure_passeur}
                  onChange={(e) => setDraft((d) => (d ? { ...d, meilleure_passeur: e.target.value } : d))}
                  placeholder="Prénom Nom"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Plus présent</label>
                <Input
                  value={draft.joueur_plus_present}
                  onChange={(e) => setDraft((d) => (d ? { ...d, joueur_plus_present: e.target.value } : d))}
                  placeholder="Prénom Nom"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Joueurs à l&apos;honneur
              </label>
              <div className="space-y-2">
                {draft.meilleurs_joueurs.map((mj, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Input
                      className="w-1/3 shrink-0"
                      value={mj.nom}
                      onChange={(e) =>
                        setDraft((d) => {
                          if (!d) return d;
                          const arr = [...d.meilleurs_joueurs];
                          arr[i] = { ...arr[i], nom: e.target.value };
                          return { ...d, meilleurs_joueurs: arr };
                        })
                      }
                      placeholder="Nom du joueur"
                    />
                    <Input
                      value={mj.raison}
                      onChange={(e) =>
                        setDraft((d) => {
                          if (!d) return d;
                          const arr = [...d.meilleurs_joueurs];
                          arr[i] = { ...arr[i], raison: e.target.value };
                          return { ...d, meilleurs_joueurs: arr };
                        })
                      }
                      placeholder="Raison"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground"
                      onClick={() =>
                        setDraft((d) =>
                          d ? { ...d, meilleurs_joueurs: d.meilleurs_joueurs.filter((_, j) => j !== i) } : d
                        )
                      }
                      disabled={draft.meilleurs_joueurs.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft((d) =>
                      d
                        ? { ...d, meilleurs_joueurs: [...d.meilleurs_joueurs, { nom: "", raison: "" }] }
                        : d
                    )
                  }
                  disabled={draft.meilleurs_joueurs.length >= 5}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un joueur
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="bg-[var(--color-primary-blue)] text-white font-semibold"
                onClick={saveManual}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Enregistrer
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Annuler
              </Button>
            </div>
          </div>
        ) : loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        ) : report ? (
          <>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">{report.title}</h3>
                <Badge className="bg-[var(--color-gold)]/20 text-[var(--color-gold)] border-[var(--color-gold)]/30">
                  {report.note_equipe}/10
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{report.summary}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: "Points forts", items: report.points_forts, cls: "text-emerald-700 border-emerald-200 bg-emerald-50" },
                { label: "Points à améliorer", items: report.points_faibles, cls: "text-amber-700 border-amber-200 bg-amber-50" },
                { label: "Axes de progression", items: report.axes_progression, cls: "text-blue-700 border-blue-200 bg-blue-50" },
              ].map((col) => (
                <div key={col.label} className={`rounded-lg border p-3 ${col.cls}`}>
                  <p className="text-xs font-semibold mb-1.5">{col.label}</p>
                  <ul className="space-y-1">
                    {col.items.length > 0 ? (
                      col.items.map((item, i) => (
                        <li key={i} className="text-xs leading-relaxed">
                          • {item}
                        </li>
                      ))
                    ) : (
                      <li className="text-xs opacity-70">—</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>

            {report.meilleurs_joueurs.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Meilleurs joueurs de la saison
                </p>
                <div className="space-y-1.5">
                  {report.meilleurs_joueurs.map((m, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 shrink-0 rounded-full bg-[var(--color-gold)] text-[var(--color-navy)] text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium leading-tight">{m.nom}</p>
                        <p className="text-xs text-muted-foreground">{m.raison}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pdfLoading}
                onClick={openPdf}
                className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
              >
                {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                Télécharger le PDF
              </Button>
              {isCoach && (
                <Button variant="outline" onClick={startEditing}>
                  <PenLine className="h-3.5 w-3.5 mr-1" />
                  Modifier
                </Button>
              )}
              {isCoach && (
                <Button variant="outline" onClick={generate} disabled={generating}>
                  {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                  {generating ? "Génération..." : "Régénérer par IA"}
                </Button>
              )}
            </div>
          </>
        ) : isCoach ? (
          <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
            <FileText className="h-6 w-6 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun bilan de saison pour la saison {season}. Génère un résumé IA basé sur
              les statistiques de l&apos;équipe, ou rédige-le toi-même.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                className="bg-[var(--color-primary-blue)] text-white font-semibold"
                onClick={generate}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                {generating ? "Génération..." : "Générer par IA"}
              </Button>
              <Button variant="outline" onClick={() => { setDraft(contentToDraft({ title: `Bilan de la saison ${season}`, summary: "", points_forts: [], points_faibles: [], axes_progression: [], note_equipe: 0, meilleurs_joueurs: [{ nom: "", raison: "" }], meilleur_buteur: null, meilleure_passeur: null, joueur_plus_present: null })); setEditing(true); }}>
                <PenLine className="h-4 w-4 mr-1" />
                Rédiger à la main
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun bilan de saison disponible pour la saison {season}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
