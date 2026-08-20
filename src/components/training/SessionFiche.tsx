"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useTeam } from "@/lib/team";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bookmark,
  ClipboardList,
  Clock,
  Dumbbell,
  Eye,
  FileDown,
  FileText,
  LibraryBig,
  LayoutGrid,
  Loader2,
  Lock,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { TACTICAL_PHASES, TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import {
  EXPERTISE_LEVELS,
  FOOTBALL_SYSTEMS,
  type AISession,
  type ExpertiseLevel,
} from "@/lib/training/ai-generator";
import { AIFicheView } from "@/components/training/AIFicheView";
import { VisibilityPicker, type FicheVisibility } from "@/components/training/FicheVisibilityPicker";
import { ExerciseLibraryDialog } from "@/components/training/ExerciseLibraryDialog";
import {
  TrainingTemplatesDialog,
  type TemplateFichePayload,
} from "@/components/training/TrainingTemplatesDialog";
import { TrainingSeriesDialog } from "@/components/training/TrainingSeriesDialog";
import { ExerciseEducators, type ExerciseSlot } from "@/components/training/ExerciseEducators";
import {
  ExerciseSchematicDialog,
  ExerciseSchematicView,
} from "@/components/training/ExerciseSchematic";
import { DRILL_TYPES } from "@/lib/training/exercises";
import type { Exercise, ExerciseSchematic, TrainingTemplate } from "@/types";

type FicheSource = "ai" | "manual";

interface SessionFicheRow {
  id: string;
  event_id: string;
  team_id: string;
  created_by: string | null;
  title: string;
  objectives: string[] | null;
  exercises: AISession | Exercise[] | null;
  notes: string | null;
  source: FicheSource;
  visibility: FicheVisibility;
  created_at: string;
  updated_at: string;
}

function isAISession(ex: AISession | Exercise[] | null): ex is AISession {
  return !!ex && Array.isArray((ex as AISession).sections);
}

function toPdfDataUrl(dataUrl: string): string {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export function SessionFiche({
  eventId,
  isCoach,
  eventDate,
  eventTitle,
}: {
  eventId: string;
  isCoach: boolean;
  eventDate: string;
  eventTitle: string;
}) {
  const { currentTeam } = useTeam();

  const [fiche, setFiche] = useState<SessionFicheRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [phase, setPhase] = useState<string>(TACTICAL_PHASE_NAMES[0]);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [freeObjective, setFreeObjective] = useState("");
  const [playerCount, setPlayerCount] = useState(12);
  const [systeme, setSysteme] = useState<string>("");
  const [expertise, setExpertise] = useState<ExpertiseLevel>("UEFA B");
  const [generating, setGenerating] = useState(false);

  const [manualTitle, setManualTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualExercises, setManualExercises] = useState<Exercise[]>([
    { name: "", duration: 15, description: "", drill_type: "échauffement" },
  ]);
  const [manualObjectives, setManualObjectives] = useState<string[]>([]);
  const [savingManual, setSavingManual] = useState(false);
  const [visibility, setVisibility] = useState<FicheVisibility>("coach");
  const [schematicEdit, setSchematicEdit] = useState<{ index: number; schema: ExerciseSchematic } | null>(null);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    const team = currentTeam;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("event_id", eventId)
        .eq("team_id", team.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setFiche((data as SessionFicheRow | null) ?? null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [currentTeam, eventId]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  async function openPdf(f: SessionFicheRow) {
    if (!f.exercises) return;
    setPdfLoading(true);
    try {
      const res = await authFetch("/api/trainings/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: f.exercises,
          source: f.source || (isAISession(f.exercises) ? "ai" : "manual"),
          title: f.title,
          objectives: f.objectives,
          notes: f.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      const url = toPdfDataUrl(data.pdf as string);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération du PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  function toggleObjective(obj: string) {
    if (objectives.includes(obj)) {
      setObjectives(objectives.filter((x) => x !== obj));
    } else if (objectives.length < 2) {
      setObjectives([...objectives, obj]);
    }
  }

  async function saveFiche(
    payload: Omit<SessionFicheRow, "id" | "created_at" | "updated_at" | "created_by">
  ) {
    const supabase = createClient();
    if (fiche?.id) {
      const { data, error } = await supabase
        .from("training_sessions")
        .update({ ...payload, created_by: fiche.created_by })
        .eq("id", fiche.id)
        .select()
        .single();
      if (error) throw error;
      setFiche((data as SessionFicheRow) ?? fiche);
      return data as SessionFicheRow;
    }
    const { data, error } = await supabase
      .from("training_sessions")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    const row = data as SessionFicheRow;
    setFiche(row);
    return row;
  }

  async function handleGenerate() {
    const allObjectives = [
      ...objectives,
      ...(freeObjective.trim() ? [freeObjective.trim()] : []),
    ];
    if (allObjectives.length === 0) {
      toast.error("Sélectionne un objectif ou décris-en un");
      return;
    }
    setGenerating(true);
    try {
      const res = await authFetch("/api/trainings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase, objectives: allObjectives, playerCount, systeme: systeme || undefined, expertise, team_id: currentTeam!.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      const session = data.session as AISession;
      const row = await saveFiche({
        event_id: eventId,
        team_id: currentTeam!.id,
        title: session.title,
        objectives: allObjectives,
        exercises: session,
        notes: null,
        source: "ai",
        visibility,
      });
      const url = toPdfDataUrl(data.pdf as string);
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setAiOpen(false);
      toast.success("Fiche générée et associée à l'entraînement");
      return row;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
      return null;
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveManual() {
    const valid = manualExercises.filter((ex) => ex.name.trim() !== "");
    if (valid.length === 0) {
      toast.error("Ajoute au moins un exercice");
      return;
    }
    setSavingManual(true);
    try {
      await saveFiche({
        event_id: eventId,
        team_id: currentTeam!.id,
        title: manualTitle.trim() || "Séance",
        objectives: manualObjectives,
        exercises: valid,
        notes: manualNotes.trim() || null,
        source: "manual",
        visibility,
      });
      setManualOpen(false);
      toast.success("Fiche de séance enregistrée");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSavingManual(false);
    }
  }

  async function handleDelete() {
    if (!fiche) return;
    const { error } = await createClient()
      .from("training_sessions")
      .delete()
      .eq("id", fiche.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFiche(null);
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    toast.success("Fiche supprimée");
  }

  async function applyTemplate(t: TrainingTemplate) {
    if (!currentTeam) return;
    if (t.source === "ai") {
      const session = t.exercises as AISession;
      try {
        await saveFiche({
          event_id: eventId,
          team_id: currentTeam.id,
          title: session?.title || t.name,
          objectives: t.objectives?.length
            ? t.objectives
            : session?.objective
              ? [session.objective]
              : [],
          exercises: session,
          notes: t.notes,
          source: "ai",
          visibility: t.visibility,
        });
        setTemplatesOpen(false);
        toast.success(`Modèle « ${t.name} » appliqué`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur lors de l'application du modèle");
      }
    } else {
      const exercises = (t.exercises as Exercise[]) || [];
      setManualTitle(t.name);
      setManualNotes(t.notes || "");
      setManualObjectives(t.objectives || []);
      setManualExercises(
        exercises.length > 0
          ? exercises
          : [{ name: "", duration: 15, description: "", drill_type: "échauffement" }]
      );
      setVisibility(t.visibility);
      setTemplatesOpen(false);
      setManualOpen(true);
      toast.success("Modèle chargé dans l'éditeur");
    }
  }

  async function updateVisibility(v: FicheVisibility) {
    if (!fiche) return;
    const { error } = await createClient()
      .from("training_sessions")
      .update({ visibility: v })
      .eq("id", fiche.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFiche((prev) => (prev ? { ...prev, visibility: v } : prev));
    setVisibility(v);
    toast.success(
      v === "team"
        ? "Fiche visible par toute l'équipe"
        : "Fiche visible par les coachs uniquement"
    );
  }

  function addManualExercise() {
    setManualExercises([
      ...manualExercises,
      { name: "", duration: 15, description: "", drill_type: "technique" },
    ]);
  }

  function removeManualExercise(i: number) {
    setManualExercises(manualExercises.filter((_, idx) => idx !== i));
  }

  function updateManualExercise(i: number, field: keyof Exercise, value: string | number | ExerciseSchematic | null) {
    const updated = [...manualExercises];
    updated[i] = { ...updated[i], [field]: value };
    setManualExercises(updated);
  }

  function handleSchematicChange(s: ExerciseSchematic) {
    setSchematicEdit((prev) => (prev ? { ...prev, schema: s } : prev));
  }

  function handleSchematicSave() {
    if (!schematicEdit) return;
    updateManualExercise(schematicEdit.index, "schema", schematicEdit.schema);
    setSchematicEdit(null);
  }

  function addFromLibrary(ex: Exercise) {
    setManualExercises([...manualExercises, ex]);
  }

  async function saveExerciseToLibrary(ex: Exercise) {
    if (!ex.name.trim()) {
      toast.error("Donne un nom à l'exercice avant de l'enregistrer");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("exercise_library").insert({
      team_id: currentTeam!.id,
      name: ex.name.trim(),
      duration: ex.duration,
      description: ex.description.trim() || null,
      drill_type: ex.drill_type,
      schema: ex.schema ?? null,
    });
    if (error) {
      toast.error("Erreur lors de l'enregistrement dans la bibliothèque");
      return;
    }
    toast.success("Exercice ajouté à la bibliothèque");
  }

  if (!currentTeam) return null;

  const ficheIsAi = !!fiche && isAISession(fiche.exercises);
  const aiSession = fiche && ficheIsAi && isAISession(fiche.exercises) ? fiche.exercises : null;
  const manualExercisesSaved = fiche && !ficheIsAi && Array.isArray(fiche.exercises) ? (fiche.exercises as Exercise[]) : null;

  const exerciseSlots: ExerciseSlot[] = aiSession
    ? aiSession.sections.map((s, i) => ({ index: i, label: s.name }))
    : (manualExercisesSaved || []).map((e, i) => ({ index: i, label: e.name }));

  const ficheForSave: TemplateFichePayload | null = fiche
    ? {
        name: fiche.title === "Séance" ? "" : fiche.title,
        source: fiche.source,
        exercises: fiche.exercises,
        objectives: fiche.objectives,
        notes: fiche.notes,
        visibility: fiche.visibility,
      }
    : null;

  return (
    <>
      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h3 className="font-semibold flex items-center gap-2 min-w-0">
              <ClipboardList className="h-4 w-4 text-[var(--color-royal)] shrink-0" />
              Fiche de séance
            </h3>
            {fiche && isCoach && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setTemplatesOpen(true)}>
                  <Bookmark className="h-3.5 w-3.5 mr-1" />
                  Modèles
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSeriesOpen(true)}>
                  <Repeat className="h-3.5 w-3.5 mr-1" />
                  Série hebdo
                </Button>
                <VisibilityPicker value={fiche.visibility || "coach"} onChange={updateVisibility} />
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Supprimer
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          ) : !fiche ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Aucune fiche de séance pour cet entraînement.
              </p>
              {isCoach ? (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button
                    onClick={() => { setVisibility("coach"); setAiOpen(true); }}
                    className="bg-[var(--color-primary-blue)] text-white font-semibold"
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    Générer avec l&apos;IA
                  </Button>
                  <Button variant="outline" onClick={() => { setVisibility("coach"); setManualOpen(true); }}>
                    <Dumbbell className="h-4 w-4 mr-1" />
                    Rédiger la séance
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Le coach n&apos;a pas encore créé de fiche.</p>
              )}
            </div>
          ) : !isCoach && fiche && fiche.visibility === "coach" ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Lock className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Cette fiche de séance est réservée aux coachs.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {aiSession ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{fiche.title}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />Séance IA de 90 min · {fiche.objectives?.length ?? 0} objectif(s)
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pdfLoading}
                      onClick={() => openPdf(fiche)}
                    >
                      {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                      Ouvrir le PDF
                    </Button>
                  </div>

                  <AIFicheView session={aiSession} />

                  {isCoach && (
                    <Button
                      variant="outline"
                      className="w-full border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                      onClick={() => setAiOpen(true)}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                      Régénérer la fiche
                    </Button>
                  )}
                </div>
              ) : manualExercisesSaved ? (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{fiche.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {manualExercisesSaved.length} exercice(s) ·{" "}
                        {manualExercisesSaved.reduce((sum, e) => sum + (e.duration || 0), 0)} min
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pdfLoading}
                      onClick={() => openPdf(fiche)}
                    >
                      {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileDown className="h-3.5 w-3.5 mr-1" />}
                      PDF
                    </Button>
                  </div>
                  {manualExercisesSaved.map((ex, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{ex.name || "Exercice"}</p>
                        <span className="text-xs text-muted-foreground shrink-0">{ex.duration} min</span>
                      </div>
                      {ex.drill_type && (
                        <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground mb-1">
                          {ex.drill_type}
                        </span>
                      )}
                      {ex.description && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ex.description}</p>
                      )}
                      {ex.schema && <ExerciseSchematicView schema={ex.schema} />}
                    </div>
                  ))}
                  {isCoach && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setManualTitle(fiche.title === "Séance" ? "" : fiche.title);
                        setManualNotes(fiche.notes || "");
                        setManualObjectives(fiche.objectives || []);
                        setVisibility(fiche.visibility || "coach");
                        setManualExercises(manualExercisesSaved.length > 0 ? manualExercisesSaved : [{ name: "", duration: 15, description: "", drill_type: "échauffement" }]);
                        setManualOpen(true);
                      }}
                    >
                      <Dumbbell className="h-3.5 w-3.5 mr-1" />
                      Modifier la séance
                    </Button>
                  )}
                </div>
              ) : null}

              {exerciseSlots.length > 0 && (
                <ExerciseEducators
                  eventId={eventId}
                  teamId={currentTeam.id}
                  isCoach={isCoach}
                  exercises={exerciseSlots}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog IA */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Générer la fiche de séance avec l&apos;IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Phase de jeu</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {TACTICAL_PHASE_NAMES.map((p) => (
                  <button
                    key={p}
                    className={`rounded-lg border p-2.5 text-left text-sm transition-all ${phase === p ? "border-[var(--color-royal)] bg-blue-50 ring-1 ring-[var(--color-royal)]" : "hover:border-blue-200"}`}
                    onClick={() => { setPhase(p); setObjectives([]); }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Objectifs (1 ou 2 max)</Label>
                <span className="text-xs text-muted-foreground">{objectives.length}/2</span>
              </div>
              {TACTICAL_PHASES[phase].length > 0 ? (
                <div className="space-y-1.5">
                  {TACTICAL_PHASES[phase].map((obj) => (
                    <button
                      key={obj}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-all ${objectives.includes(obj) ? "bg-[var(--color-royal)] text-white border-[var(--color-royal)]" : "hover:border-blue-200"}`}
                      onClick={() => toggleObjective(obj)}
                    >
                      {obj}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucun objectif prédéfini pour cette phase.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Objectif spécifique (optionnel)</Label>
              <Textarea
                value={freeObjective}
                onChange={(e) => setFreeObjective(e.target.value)}
                placeholder="Ex : Améliorer le jeu du troisième homme..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Joueurs présents</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPlayerCount(Math.max(4, playerCount - 1))}>-</Button>
                  <span className="text-lg font-bold flex-1 text-center">{playerCount}</span>
                  <Button variant="outline" size="sm" onClick={() => setPlayerCount(Math.min(30, playerCount + 1))}>+</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Système de jeu (optionnel)</Label>
                <select
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                  value={systeme}
                  onChange={(e) => setSysteme(e.target.value)}
                >
                  <option value="">Aucun</option>
                  {FOOTBALL_SYSTEMS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Niveau d&apos;expertise du coach IA</Label>
              <select
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={expertise}
                onChange={(e) => setExpertise(e.target.value as ExpertiseLevel)}
              >
                {EXPERTISE_LEVELS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Visibilité</Label>
              <VisibilityPicker value={visibility} onChange={setVisibility} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)}>Annuler</Button>
            <Button
              className="bg-[var(--color-primary-blue)] text-white font-semibold"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {generating ? "Génération..." : "Générer la fiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog manuel */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rédiger la fiche de séance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Titre</Label>
              <Input
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                placeholder="Ex : Entraînement mercredi"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Objectifs (optionnel)</Label>
              <Textarea
                value={manualObjectives.join("\n")}
                onChange={(e) => setManualObjectives(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 2))}
                placeholder="Un objectif par ligne (2 max)"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Exercices</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLibraryOpen(true)}>
                    <LibraryBig className="h-3.5 w-3.5 mr-1" />
                    Bibliothèque
                  </Button>
                  <Button variant="outline" size="sm" onClick={addManualExercise}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Ajouter
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {manualExercises.map((ex, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 flex-1"
                        value={ex.name}
                        onChange={(e) => updateManualExercise(i, "name", e.target.value)}
                        placeholder="Nom de l'exercice"
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={() => saveExerciseToLibrary(ex)} title="Enregistrer dans la bibliothèque" aria-label="Enregistrer dans la bibliothèque">
                        <Bookmark className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => removeManualExercise(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
                        value={ex.drill_type}
                        onChange={(e) => updateManualExercise(i, "drill_type", e.target.value)}
                      >
                        {DRILL_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground">Durée</span>
                        <Input
                          type="number"
                          min={1}
                          max={120}
                          className="h-8 w-16"
                          value={ex.duration}
                          onChange={(e) => updateManualExercise(i, "duration", parseInt(e.target.value) || 15)}
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() =>
                          setSchematicEdit({
                            index: i,
                            schema: ex.schema?.elements?.length
                              ? { elements: ex.schema.elements.map((el) => ({ ...el })) }
                              : { elements: [] },
                          })
                        }
                      >
                        <LayoutGrid className="h-3 w-3 mr-1" />
                        {ex.schema?.elements?.length ? `Schéma (${ex.schema.elements.length})` : "Schéma"}
                      </Button>
                      <span className="text-[10px] text-muted-foreground">
                        {ex.schema?.elements?.length ? "schéma attaché" : "sans schéma"}
                      </span>
                    </div>
                    <Textarea
                      rows={2}
                      value={ex.description}
                      onChange={(e) => updateManualExercise(i, "description", e.target.value)}
                      placeholder="Consignes, organisation, critères de réussite..."
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Notes (optionnel)</Label>
              <Textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                placeholder="Remarques, adaptations..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Visibilité</Label>
              <VisibilityPicker value={visibility} onChange={setVisibility} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveManual} disabled={savingManual}>
              {savingManual ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
              {fiche && !ficheIsAi ? "Mettre à jour" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schéma d'exercice */}
      <ExerciseSchematicDialog
        open={!!schematicEdit}
        onOpenChange={(v) => {
          if (!v) setSchematicEdit(null);
        }}
        value={schematicEdit?.schema ?? { elements: [] }}
        onChange={handleSchematicChange}
        onSave={handleSchematicSave}
      />

      {/* Bibliothèque d'exercices */}
      <ExerciseLibraryDialog
        teamId={currentTeam.id}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onAdd={addFromLibrary}
        isCoach={isCoach}
      />

      {/* Modèles de séance */}
      {isCoach && (
        <TrainingTemplatesDialog
          teamId={currentTeam.id}
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          ficheForSave={ficheForSave}
          onApply={applyTemplate}
        />
      )}

      {/* Série hebdomadaire */}
      {isCoach && (
        <TrainingSeriesDialog
          teamId={currentTeam.id}
          eventDate={eventDate}
          eventTitle={eventTitle}
          fiche={
            fiche
              ? {
                  title: fiche.title,
                  source: fiche.source,
                  exercises: fiche.exercises,
                  objectives: fiche.objectives,
                  notes: fiche.notes,
                  visibility: fiche.visibility,
                }
              : null
          }
          open={seriesOpen}
          onOpenChange={setSeriesOpen}
        />
      )}
    </>
  );
}
