"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Bookmark,
  Calendar,
  Clock,
  FileDown,
  FileText,
  LayoutGrid,
  LibraryBig,
  Loader2,
  PenLine,
  Plus,
  Shirt,
  Sparkles,
  Swords,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { TACTICAL_PHASES as PHASE_OBJECTIVES, TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import { FOOTBALL_SYSTEMS, EXPERTISE_LEVELS, type AISession, type ExpertiseLevel } from "@/lib/training/ai-generator";
import { AIFicheView, isAiSessionExercises } from "@/components/training/AIFicheView";
import { VisibilityPicker, type FicheVisibility } from "@/components/training/FicheVisibilityPicker";
import { ExerciseLibraryDialog } from "@/components/training/ExerciseLibraryDialog";
import {
  ExerciseSchematicDialog,
  ExerciseSchematicView,
} from "@/components/training/ExerciseSchematic";
import { ExerciseEducators, type ExerciseSlot } from "@/components/training/ExerciseEducators";
import { DRILL_TYPES } from "@/lib/training/exercises";

import type {
  TrainingSession,
  Exercise,
  ExerciseSchematic,
  Event,
} from "@/types";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeanceTab() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const supabaseRef = useRef(createClient());

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [attendanceCount, setAttendanceCount] = useState<{ present: number; total: number } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [schematicEdit, setSchematicEdit] = useState<{ index: number; schema: ExerciseSchematic } | null>(null);

  const [form, setForm] = useState({
    event_id: "",
    title: "",
    notes: "",
  });
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([
    { name: "", duration: 15, description: "", drill_type: "échauffement" },
  ]);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [freeObjective, setFreeObjective] = useState("");
  const [playerCount, setPlayerCount] = useState(12);
  const [systeme, setSysteme] = useState("");
  const [expertise, setExpertise] = useState<ExpertiseLevel>("UEFA B");
  const [generatedAi, setGeneratedAi] = useState<AISession | null>(null);
  const [visibility, setVisibility] = useState<FicheVisibility>("coach");

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l'équipe...</p></div>;
  }

  const fetchData = useCallback(async () => {
    const [sessionsRes, eventsRes] = await Promise.all([
      supabaseRef.current
        .from("training_sessions")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .order("created_at", { ascending: false }),
      supabaseRef.current
        .from("events")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .eq("type", "training")
        .order("event_date", { ascending: true }),
    ]);
    setSessions((sessionsRes.data as TrainingSession[]) || []);
    setEvents((eventsRes.data as Event[]) || []);
    setLoading(false);
  }, [currentTeam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedSession?.event_id || !currentTeam) return;
    supabaseRef.current
      .from("attendances")
      .select("status")
      .eq("event_id", selectedSession.event_id)
      .then(({ data }) => {
        if (!data) { setAttendanceCount(null); return; }
        const present = data.filter((a) => a.status === "present" || a.status === "late").length;
        setAttendanceCount({ present, total: data.length });
      });
  }, [selectedSession?.event_id, currentTeam]);

  function addExercise() {
    setExercises([
      ...exercises,
      { name: "", duration: 15, description: "", drill_type: "technique" },
    ]);
  }

  function removeExercise(index: number) {
    setExercises(exercises.filter((_, i) => i !== index));
  }

  function updateExercise(index: number, field: keyof Exercise, value: string | number | ExerciseSchematic | null) {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
  }

  function handleSchematicChange(s: ExerciseSchematic) {
    setSchematicEdit((prev) => (prev ? { ...prev, schema: s } : prev));
  }

  function handleSchematicSave() {
    if (!schematicEdit) return;
    updateExercise(schematicEdit.index, "schema", schematicEdit.schema);
    setSchematicEdit(null);
  }

  function addFromLibrary(ex: Exercise) {
    setExercises([...exercises, ex]);
  }

  async function saveExerciseToLibrary(ex: Exercise) {
    if (!ex.name.trim()) {
      toast.error("Donne un nom à l'exercice avant de l'enregistrer");
      return;
    }
    const { error } = await supabaseRef.current.from("exercise_library").insert({
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

  async function handleDeleteSession() {
    if (!selectedSession) return;
    if (!confirm("Supprimer cette séance ?")) return;
    const { error } = await supabaseRef.current
      .from("training_sessions")
      .delete()
      .eq("id", selectedSession.id);
    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Séance supprimée");
      setSessions((prev) => prev.filter((s) => s.id !== selectedSession.id));
      setSelectedSession(null);
    }
  }

  async function handleDownloadPdf(target: TrainingSession) {
    if (!target.exercises) return;
    setPdfLoading(true);
    try {
      const raw = target.exercises as unknown;
      const isAi = Array.isArray((raw as { sections?: unknown }).sections);
      const res = await authFetch("/api/trainings/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: raw,
          source: isAi ? "ai" : "manual",
          title: target.title,
          objectives: target.objectives,
          notes: target.notes,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      const base64 = (data.pdf as string).split(",")[1] || "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération du PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.event_id) {
      toast.error("Veuillez sélectionner un événement");
      return;
    }

    setSubmitting(true);
    const objectives = [
      ...selectedObjectives,
      ...(freeObjective.trim() ? [freeObjective.trim()] : []),
    ];

    if (mode === "ai") {
      if (!generatedAi) {
        toast.error("Génère d'abord la fiche IA");
        setSubmitting(false);
        return;
      }
      const { data, error } = await supabaseRef.current.from("training_sessions").insert({
        event_id: form.event_id,
        title: generatedAi.title,
        objectives: objectives.length > 0 ? objectives : null,
        exercises: generatedAi as unknown as Exercise[],
        notes: null,
        created_by: user?.id || null,
        team_id: currentTeam!.id,
        visibility,
      }).select().single();
      if (error) {
        toast.error("Erreur lors de la création");
      } else {
        toast.success("Séance IA créée avec succès");
        setCreateOpen(false);
        resetForm();
        setSessions((prev) => [data as TrainingSession, ...prev]);
      }
      setSubmitting(false);
      return;
    }

    const validExercises = exercises.filter((ex) => ex.name.trim() !== "");
    const { data, error } = await supabaseRef.current.from("training_sessions").insert({
      event_id: form.event_id,
      title: form.title,
      objectives: selectedObjectives.length > 0 ? selectedObjectives : null,
      exercises: validExercises.length > 0 ? validExercises : null,
      notes: form.notes || null,
      created_by: user?.id || null,
      team_id: currentTeam!.id,
      visibility,
    }).select().single();

    if (error) {
      toast.error("Erreur lors de la création");
    } else {
      toast.success("Séance créée avec succès");
      setCreateOpen(false);
      resetForm();
      setSessions((prev) => [data as TrainingSession, ...prev]);
    }
    setSubmitting(false);
  }

  function resetForm() {
    setForm({ event_id: "", title: "", notes: "" });
    setSelectedObjectives([]);
    setExercises([{ name: "", duration: 15, description: "", drill_type: "échauffement" }]);
    setFreeObjective("");
    setPlayerCount(attendanceCount?.present || 12);
    setSysteme("");
    setGeneratedAi(null);
    setMode("ai");
    setVisibility("coach");
  }

  async function handleGenerateAiFiche() {
    if (!form.title) {
      toast.error("Sélectionnez d'abord une phase");
      return;
    }
    const objectives = [
      ...selectedObjectives,
      ...(freeObjective.trim() ? [freeObjective.trim()] : []),
    ];
    if (objectives.length === 0) {
      toast.error("Sélectionne un objectif ou décris-en un");
      return;
    }
    setGenerating(true);
    try {
      const res = await authFetch("/api/trainings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: form.title,
          objectives,
          playerCount,
          systeme: systeme || undefined,
          expertise,
          team_id: currentTeam!.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Erreur");
      }
      const data = await res.json();
      setGeneratedAi(data.session as AISession);
      toast.success("Fiche IA générée !");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setGenerating(false);
    }
  }

  const eventMap = new Map(events.map((ev) => [ev.id, ev]));

  if (selectedSession) {
    const event = eventMap.get(selectedSession.event_id);
    const aiSelected = isAiSessionExercises(selectedSession.exercises);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSession(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          {isCoach && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDeleteSession}>
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDownloadPdf(selectedSession)}
            disabled={pdfLoading || !selectedSession.exercises}
          >
            {pdfLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
            PDF
          </Button>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
                  {aiSelected ? selectedSession.title : (selectedSession.title ? `Phase : ${selectedSession.title}` : "(Sans phase)")}
                  {aiSelected && <Badge className="bg-[var(--color-gold)] text-[var(--color-navy)] border-transparent">Fiche IA</Badge>}
                </CardTitle>
                {event && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.title} — {formatDate(event.event_date)}
                  </p>
                )}
                {attendanceCount && (
                  <div className="mt-3 flex items-center gap-1.5 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">{attendanceCount.present}</span>
                    <span className="text-muted-foreground">/ {attendanceCount.total} présents</span>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedSession.objectives && selectedSession.objectives.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Target className="h-4 w-4" />
                  Objectifs
                </h4>
                <div className="flex flex-wrap gap-2">
                  {selectedSession.objectives.map((obj, i) => (
                    <Badge key={i} variant="secondary">
                      {obj}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {aiSelected ? (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4" />
                  Fiche de séance (IA)
                </h4>
                <AIFicheView session={selectedSession.exercises as unknown as AISession} />
              </div>
            ) : selectedSession.exercises && selectedSession.exercises.length > 0 ? (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Exercices ({selectedSession.exercises.length})
                </h4>
                <div className="space-y-3">
                  {selectedSession.exercises.map((ex, i) => (
                    <div key={i} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {ex.drill_type}
                          </Badge>
                          <span className="font-medium">{ex.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {ex.duration} min
                        </span>
                      </div>
                      {ex.description && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {ex.description}
                        </p>
                      )}
                      {ex.schema && <ExerciseSchematicView schema={ex.schema} />}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedSession.notes && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Notes
                </h4>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {selectedSession.notes}
                </p>
              </div>
            )}

            {(() => {
              const slots: ExerciseSlot[] = aiSelected
                ? ((selectedSession.exercises as unknown as AISession).sections || []).map((s, i) => ({ index: i, label: s.name }))
                : (selectedSession.exercises || []).map((e, i) => ({ index: i, label: e.name }));
              return slots.length > 0 && currentTeam ? (
                <ExerciseEducators
                  eventId={selectedSession.event_id}
                  teamId={currentTeam.id}
                  isCoach={isCoach}
                  exercises={slots}
                />
              ) : null;
            })()}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sessions.length} séance{sessions.length !== 1 ? "s" : ""}
        </p>
        {isCoach && (
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger render={<Button size="sm" className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" />}>
              <Plus className="mr-1 h-4 w-4" />
              Nouvelle séance
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer une séance</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Événement *</Label>
                  <Select
                    value={form.event_id}
                    onValueChange={(v) => setForm({ ...form, event_id: v ?? "" })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner un entraînement">
                        {(v) => {
                          if (!v) return "Sélectionner un entraînement";
                          const ev = events.find((e) => e.id === v);
                          return ev ? `${ev.title} — ${formatDate(ev.event_date)}` : v;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {events
                        .filter(
                          (ev) =>
                            !sessions.some((s) => s.event_id === ev.id)
                        )
                        .map((ev) => (
                          <SelectItem key={ev.id} value={ev.id}>
                            {ev.title} — {formatDate(ev.event_date)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mode de création */}
                <div className="flex gap-1 rounded-lg border p-0.5 bg-muted/30">
                  <button
                    type="button"
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === "ai" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setMode("ai")}
                  >
                    <Sparkles className="h-3.5 w-3.5 inline mr-1" />
                    Fiche IA
                  </button>
                  <button
                    type="button"
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === "manual" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => setMode("manual")}
                  >
                    <PenLine className="h-3.5 w-3.5 inline mr-1" />
                    Saisie manuelle
                  </button>
                </div>

                <div className="space-y-2">
                  <Label>Phase</Label>
                  <Select
                    value={form.title}
                    onValueChange={(v) => {
                      setForm({ ...form, title: v ?? "" });
                      setSelectedObjectives([]);
                      setGeneratedAi(null);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner une phase">
                        {(v) => {
                          if (!v) return "Sélectionner une phase";
                          return v;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TACTICAL_PHASE_NAMES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Objectifs (max 2)</Label>
                  {PHASE_OBJECTIVES[form.title] && PHASE_OBJECTIVES[form.title].length > 0 ? (
                    <div className="space-y-1.5">
                      {PHASE_OBJECTIVES[form.title].map((obj) => {
                        const checked = selectedObjectives.includes(obj);
                        const atMax = selectedObjectives.length >= 2 && !checked;
                        return (
                          <label
                            key={obj}
                            className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                              checked ? "border-[var(--color-gold)] bg-[var(--color-gold)]/5" : "hover:bg-muted"
                            } ${atMax ? "opacity-40" : ""}`}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={atMax}
                              onCheckedChange={() => {
                                setSelectedObjectives(
                                  checked
                                    ? selectedObjectives.filter((o) => o !== obj)
                                    : [...selectedObjectives, obj]
                                );
                              }}
                            />
                            <span className="text-sm">{obj}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {form.title ? "Aucun objectif disponible pour cette phase" : "Sélectionnez d'abord une phase"}
                    </p>
                  )}
                </div>

                {mode === "ai" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Objectif spécifique (optionnel)</Label>
                      <Textarea
                        value={freeObjective}
                        onChange={(e) => setFreeObjective(e.target.value)}
                        placeholder="Ex : Améliorer le jeu du troisième homme..."
                        rows={2}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Joueurs présents</Label>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setPlayerCount(Math.max(4, playerCount - 1))}>-</Button>
                          <span className="text-lg font-bold flex-1 text-center">{playerCount}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => setPlayerCount(Math.min(30, playerCount + 1))}>+</Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Système de jeu (optionnel)</Label>
                        <Select value={systeme} onValueChange={(v) => setSysteme(v ?? "")}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Aucun" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Aucun</SelectItem>
                            {FOOTBALL_SYSTEMS.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Niveau d'expertise du coach IA</Label>
                      <Select value={expertise} onValueChange={(v) => setExpertise((v as ExpertiseLevel) ?? "UEFA B")}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPERTISE_LEVELS.map((e) => (
                            <SelectItem key={e} value={e}>{e}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateAiFiche}
                      disabled={generating || !form.title}
                      className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                    >
                      {generating ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                      {generating ? "Génération en cours..." : generatedAi ? "Régénérer la fiche" : "Générer la fiche IA"}
                    </Button>

                    {generatedAi && (
                      <div className="rounded-lg border border-[var(--color-gold)]/40 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold truncate">{generatedAi.title}</p>
                          <span className="text-xs text-muted-foreground shrink-0">90 min</span>
                        </div>
                        {generatedAi.material && (
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Matériel : </span>{generatedAi.material}
                          </p>
                        )}
                        <div className="space-y-1">
                          {generatedAi.sections.map((s, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground truncate">{s.name}</span>
                              {s.duration > 0 && <span className="shrink-0 ml-2">{s.duration} min</span>}
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          La fiche complète (consignes, variantes, schémas) sera associée à l&apos;entraînement.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Notes supplémentaires..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Exercices</Label>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setLibraryOpen(true)}>
                            <LibraryBig className="mr-1 h-3 w-3" />
                            Bibliothèque
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={addExercise} className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10">
                            <Plus className="mr-1 h-3 w-3" />
                            Ajouter
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {exercises.map((ex, i) => (
                          <div key={i} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Exercice {i + 1}
                              </span>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-muted-foreground"
                                  onClick={() =>
                                    setSchematicEdit({
                                      index: i,
                                      schema: ex.schema?.elements?.length
                                        ? { elements: ex.schema.elements.map((el) => ({ ...el })) }
                                        : { elements: [] },
                                    })
                                  }
                                  title={ex.schema ? "Modifier le schéma" : "Ajouter un schéma"}
                                >
                                  <LayoutGrid className="h-3 w-3" />
                                  {ex.schema?.elements?.length ? <span className="ml-1 text-[10px]">{ex.schema.elements.length}</span> : null}
                                </Button>
                                {exercises.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeExercise(i)}
                                    className="h-6 px-2 text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Input
                                value={ex.name}
                                onChange={(e) => updateExercise(i, "name", e.target.value)}
                                placeholder="Nom de l'exercice"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 text-muted-foreground"
                                onClick={() => saveExerciseToLibrary(ex)}
                                title="Enregistrer dans la bibliothèque"
                                aria-label="Enregistrer dans la bibliothèque"
                              >
                                <Bookmark className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <Input
                                  type="number"
                                  min={1}
                                  value={ex.duration}
                                  onChange={(e) =>
                                    updateExercise(i, "duration", parseInt(e.target.value) || 15)
                                  }
                                  placeholder="Durée (min)"
                                />
                              </div>
                              <div className="flex-1">
                                <Select
                                  value={ex.drill_type}
                                  onValueChange={(v) =>
                                    updateExercise(i, "drill_type", v ?? "technique")
                                  }
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {DRILL_TYPES.map((dt) => (
                                      <SelectItem key={dt} value={dt}>
                                        {dt}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Textarea
                              value={ex.description}
                              onChange={(e) => updateExercise(i, "description", e.target.value)}
                              placeholder="Description (optionnel)"
                              rows={2}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Visibilité de la fiche</Label>
                  <VisibilityPicker value={visibility} onChange={setVisibility} />
                  <p className="text-xs text-muted-foreground">
                    {visibility === "coach"
                      ? "Visible uniquement par les coachs."
                      : "Visible par toute l'équipe."}
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCreateOpen(false);
                      resetForm();
                    }}
                    className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold">
                    {submitting ? "Création..." : "Créer la séance"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Bibliothèque d'exercices */}
        <ExerciseLibraryDialog
          teamId={currentTeam.id}
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
          onAdd={addFromLibrary}
          isCoach={userRole === "coach" || userRole === "owner"}
        />

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
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          Chargement...
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={Swords}
          title="Aucune séance enregistrée"
          description="Créez votre première séance d'entraînement tactique."
        />
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const event = eventMap.get(session.event_id);
            const isAi = isAiSessionExercises(session.exercises);
            return (
              <Card
                key={session.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => setSelectedSession(session)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-medium">{isAi ? session.title : (session.title ? `Phase : ${session.title}` : "(Sans phase)")}</h3>
                      {event && (
                        <p className="text-sm text-muted-foreground">
                          {event.title} — {formatDate(event.event_date)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label="Télécharger le PDF"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadPdf(session);
                        }}
                        disabled={!session.exercises}
                      >
                        <FileDown className="h-4 w-4" />
                      </button>
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {isAi ? (
                      <Badge className="bg-[var(--color-gold)] text-[var(--color-navy)] border-transparent text-xs">
                        Fiche IA
                      </Badge>
                    ) : session.exercises && session.exercises.length > 0 ? (
                      <Badge variant="secondary" className="text-xs">
                        {session.exercises.length} exercice
                        {session.exercises.length !== 1 ? "s" : ""}
                      </Badge>
                    ) : null}
                    {session.objectives &&
                      session.objectives.slice(0, 2).map((obj, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {obj}
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
