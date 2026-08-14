"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Sparkles,
  Loader2,
  Star,
  ThumbsUp,
  AlertCircle,
  TrendingUp,
  Trophy,
  Share2,
  PenLine,
  Plus,
  Trash2,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { logActivity } from "@/lib/activity";
import type { MatchReportContent } from "@/app/api/matches/report/route";

interface Props {
  matchId: string;
  teamId: string;
  isCoach: boolean;
  hasData: boolean;
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
}

const EMPTY_DRAFT: Draft = {
  title: "",
  summary: "",
  points_forts: "",
  points_faibles: "",
  axes_progression: "",
  note_equipe: 0,
  meilleurs_joueurs: [{ nom: "", raison: "" }],
};

function contentToDraft(report: MatchReportContent | null): Draft {
  if (!report) return EMPTY_DRAFT;
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
  };
}

function draftToContent(draft: Draft): MatchReportContent {
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
  };
}

export function MatchReportCard({ matchId, teamId, isCoach, hasData }: Props) {
  const [report, setReport] = useState<MatchReportContent | null>(null);
  const [source, setSource] = useState<"ai" | "manual" | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/matches/report?eventId=${matchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setReport(data?.report ?? null);
        setSource(data?.source ?? null);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  async function notifyPublished() {
    try {
      const supabase = createClient();
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", teamId)
        .in("role", ["player"]);
      const playerIds = (members || []).map((m) => m.user_id);
      if (playerIds.length === 0) return;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .in("id", playerIds)
        .eq("is_active", true);
      const activePlayerIds = (profiles || []).map((p) => p.id);
      if (activePlayerIds.length === 0) return;

      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", teamId)
        .in("student_id", activePlayerIds);
      const parentIds = [
        ...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id)),
      ];
      const userIds = [...new Set([...activePlayerIds, ...parentIds])];

      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: userIds,
          title: "Compte-rendu du match publié",
          body: report?.title || "Le compte-rendu du match est disponible",
          type: "match_report",
          reference_id: matchId,
          team_id: teamId,
          url: `/matches/${matchId}`,
        }),
      });
    } catch (err) {
      console.error("[match-report] notify error:", err);
    }
  }

  async function logPublished(mode: "ai" | "manual", title: string) {
    try {
      const supabase = createClient();
      const { data: team } = await supabase
        .from("teams")
        .select("club_id")
        .eq("id", teamId)
        .maybeSingle();
      await logActivity({
        teamId,
        clubId: (team as { club_id: string | null } | null)?.club_id ?? null,
        actionType: "match.report",
        description: `Compte-rendu ${mode === "ai" ? "généré par IA" : "rédigé"} : ${title}`,
        metadata: { eventId: matchId, mode },
      });
    } catch (err) {
      console.error("[match-report] log error:", err);
    }
  }

  async function generate() {
    if (!hasData) {
      toast.error("Renseigne d'abord le score du match");
      return;
    }
    setGenerating(true);
    try {
      const res = await authFetch("/api/matches/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: matchId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      setReport(data.report as MatchReportContent);
      setSource("ai");
      setEditing(false);
      toast.success("Compte-rendu généré !");
      notifyPublished();
      logPublished("ai", data.report?.title || "Compte-rendu IA");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  function startEditing() {
    setDraft(contentToDraft(report));
    setEditing(true);
  }

  async function saveManual() {
    const content = draftToContent(draft);
    if (!content.title) {
      toast.error("Le titre du compte-rendu est requis");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/matches/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: matchId,
          mode: "manual",
          report: content,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      setReport(data.report as MatchReportContent);
      setSource("manual");
      setEditing(false);
      toast.success("Compte-rendu enregistré !");
      notifyPublished();
      logPublished("manual", content.title);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-[var(--color-gold)]" />
            Compte-rendu du match
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  // Mode édition (coach)
  if (editing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PenLine className="h-4 w-4 text-[var(--color-gold)]" />
            Rédiger le compte-rendu
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Titre *
            </label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Compte-rendu du match du 15/02 contre ..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Résumé du match
            </label>
            <Textarea
              value={draft.summary}
              onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              placeholder="Paragraphe synthétique (contexte, tournant du match, résultat)..."
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
                  onClick={() => setDraft((d) => ({ ...d, note_equipe: i }))}
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
              onChange={(e) => setDraft((d) => ({ ...d, points_forts: e.target.value }))}
              placeholder={"Bonne circulation du ballon\nSolidarité défensive"}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Points à améliorer <span className="text-muted-foreground/60">(une par ligne)</span>
            </label>
            <Textarea
              value={draft.points_faibles}
              onChange={(e) => setDraft((d) => ({ ...d, points_faibles: e.target.value }))}
              placeholder={"Transition défensive\nPrise de balle sous pression"}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Axes de progression <span className="text-muted-foreground/60">(une par ligne)</span>
            </label>
            <Textarea
              value={draft.axes_progression}
              onChange={(e) => setDraft((d) => ({ ...d, axes_progression: e.target.value }))}
              placeholder={"Travail de la relance courte\nJeu dans les intervalles"}
              rows={3}
            />
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
                      setDraft((d) => ({
                        ...d,
                        meilleurs_joueurs: d.meilleurs_joueurs.filter((_, j) => j !== i),
                      }))
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
                  setDraft((d) => ({
                    ...d,
                    meilleurs_joueurs: [...d.meilleurs_joueurs, { nom: "", raison: "" }],
                  }))
                }
                disabled={draft.meilleurs_joueurs.length >= 5}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter un joueur
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              className="bg-[var(--color-primary-blue)] text-white font-semibold"
              onClick={saveManual}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Annuler
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-[var(--color-gold)] shrink-0" />
            Compte-rendu du match
          </CardTitle>
          {isCoach && (
            <div className="flex flex-wrap items-center gap-1.5">
              {report && (
                <Button size="sm" variant="outline" onClick={startEditing}>
                  <PenLine className="h-3.5 w-3.5 mr-1" />
                  Modifier
                </Button>
              )}
              <Button
                size="sm"
                className="bg-[var(--color-primary-blue)] text-white font-semibold"
                onClick={generate}
                disabled={generating || !hasData}
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                )}
                {report ? "Régénérer par IA" : "Générer par IA"}
              </Button>
              {!report && (
                <Button size="sm" variant="outline" onClick={startEditing}>
                  <PenLine className="h-3.5 w-3.5 mr-1" />
                  Rédiger
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!report ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isCoach
                ? "Génère un compte-rendu automatique du match (points forts, points à améliorer, axes de progression) à partir du score et des stats, ou rédige-le toi-même. Il sera partagé avec les joueurs et les parents."
                : "Le compte-rendu du match n'a pas encore été publié."}
            </p>
            {isCoach && (
              <Button variant="outline" onClick={startEditing}>
                <PenLine className="h-4 w-4 mr-1.5" />
                Rédiger le compte-rendu manuellement
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h4 className="font-semibold text-sm">{report.title}</h4>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {source === "manual" ? "Rédigé par le coach" : "Généré par IA"}
                </span>
              </div>
              {report.note_equipe > 0 && (
                <div className="flex items-center gap-1 rounded-lg bg-[var(--color-gold)]/20 px-3 py-1.5">
                  <Star className="h-4 w-4 fill-[var(--color-gold)] text-[var(--color-gold)]" />
                  <span className="text-sm font-bold">{report.note_equipe}/10</span>
                </div>
              )}
            </div>

            {report.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
            )}

            {report.points_forts.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                  <ThumbsUp className="h-3.5 w-3.5" /> Points forts
                </p>
                <ul className="space-y-1">
                  {report.points_forts.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-900">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.points_faibles.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Points à améliorer
                </p>
                <ul className="space-y-1">
                  {report.points_faibles.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.axes_progression.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Axes de progression
                </p>
                <ul className="space-y-1">
                  {report.axes_progression.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                      <span className="text-blue-500 mt-0.5">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.meilleurs_joueurs.length > 0 && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-[var(--color-gold)]" /> Joueurs à l&apos;honneur
                </p>
                <ul className="space-y-1.5">
                  {report.meilleurs_joueurs.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="font-semibold shrink-0">{m.nom}</span>
                      {m.raison && <span className="text-muted-foreground">{m.raison}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isCoach && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Share2 className="h-3 w-3" /> Partage avec les joueurs et parents à chaque
                enregistrement ou régénération.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
