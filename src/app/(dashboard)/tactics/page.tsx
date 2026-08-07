"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Plus,
  Calendar,
  Clock,
  Target,
  FileText,
  ArrowLeft,
  Trash2,
  Shirt,
  Users,
  Crown,
  Swords,
  ClipboardList,
  FileDown,
  Loader2,
  Sparkles,
  PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { TACTICAL_PHASES as PHASE_OBJECTIVES, TACTICAL_PHASE_NAMES } from "@/lib/training/phases";
import { FOOTBALL_SYSTEMS, EXPERTISE_LEVELS, type AISession, type ExpertiseLevel } from "@/lib/training/ai-generator";
import { AIFicheView, isAiSessionExercises } from "@/components/training/AIFicheView";
import { VisibilityPicker, type FicheVisibility } from "@/components/training/FicheVisibilityPicker";
import type {
  TrainingSession,
  Exercise,
  Profile,
  Event,
  Formation,
} from "@/types";

const DRILL_TYPES = [
  "échauffement",
  "technique",
  "tactique",
  "physique",
  "jeu",
];

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

// --- Séance Tab ----------------------------------------------------------------

function SéanceTab() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const supabaseRef = useRef(createClient());

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [attendanceCount, setAttendanceCount] = useState<{ present: number; total: number } | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

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

  function updateExercise(index: number, field: keyof Exercise, value: string | number) {
    const updated = [...exercises];
    updated[index] = { ...updated[index], [field]: value };
    setExercises(updated);
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
      const res = await fetch("/api/trainings/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: raw, source: isAi ? "ai" : "manual" }),
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
      const res = await fetch("/api/trainings/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: form.title,
          objectives,
          playerCount,
          systeme: systeme || undefined,
          expertise,
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
            <DialogTrigger render={<Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
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
                        <Button type="button" variant="outline" size="sm" onClick={addExercise} className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10">
                          <Plus className="mr-1 h-3 w-3" />
                          Ajouter
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {exercises.map((ex, i) => (
                          <div key={i} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Exercice {i + 1}
                              </span>
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
                            <Input
                              value={ex.name}
                              onChange={(e) => updateExercise(i, "name", e.target.value)}
                              placeholder="Nom de l'exercice"
                            />
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
                  <Button type="submit" disabled={submitting} className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold">
                    {submitting ? "Création..." : "Créer la séance"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          Chargement...
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          Aucune séance enregistrée
        </div>
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

// --- Pitch SVG (reusable) ---

function PitchSVG() {
  return (
    <svg viewBox="0 0 300 450" className="absolute inset-0 h-full w-full pointer-events-none" preserveAspectRatio="none">
      <rect x="8" y="8" width="284" height="434" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2" rx="2" />
      <line x1="8" y1="225" x2="292" y2="225" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="225" r="50" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="225" r="3" fill="rgba(255,255,255,0.5)" />
      <rect x="75" y="8" width="150" height="80" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="105" y="8" width="90" height="35" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="55" r="3" fill="rgba(255,255,255,0.5)" />
      <path d="M 115 88 Q 150 72 185 88" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="120" y="0" width="60" height="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <rect x="75" y="362" width="150" height="80" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="105" y="407" width="90" height="35" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <circle cx="150" cy="395" r="3" fill="rgba(255,255,255,0.5)" />
      <path d="M 115 362 Q 150 378 185 362" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <rect x="120" y="442" width="60" height="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <path d="M 8 16 A 8 8 0 0 1 16 8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <path d="M 284 8 A 8 8 0 0 1 292 16" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <path d="M 8 434 A 8 8 0 0 0 16 442" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
      <path d="M 284 442 A 8 8 0 0 0 292 434" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
    </svg>
  );
}

// --- Feuillet Match Tab --------------------------------------------------------

interface SlotPos {
  x: number;
  y: number;
  label: string;
}

const FORMATIONS: Record<string, SlotPos[]> = {
  "4-3-3": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière G" },
    { x: 38, y: 72, label: "Défenseur" },
    { x: 62, y: 72, label: "Défenseur" },
    { x: 85, y: 70, label: "Arrière D" },
    { x: 30, y: 48, label: "Milieu" },
    { x: 50, y: 45, label: "Milieu" },
    { x: 70, y: 48, label: "Milieu" },
    { x: 15, y: 25, label: "Ailier G" },
    { x: 50, y: 22, label: "Buteur" },
    { x: 85, y: 25, label: "Ailier D" },
  ],
  "4-4-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière G" },
    { x: 38, y: 72, label: "Défenseur" },
    { x: 62, y: 72, label: "Défenseur" },
    { x: 85, y: 70, label: "Arrière D" },
    { x: 15, y: 45, label: "Ailier G" },
    { x: 38, y: 48, label: "Milieu" },
    { x: 62, y: 48, label: "Milieu" },
    { x: 85, y: 45, label: "Ailier D" },
    { x: 38, y: 22, label: "Buteur" },
    { x: 62, y: 22, label: "Buteur" },
  ],
  "3-5-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 25, y: 72, label: "Défenseur" },
    { x: 50, y: 72, label: "Défenseur" },
    { x: 75, y: 72, label: "Défenseur" },
    { x: 10, y: 48, label: "Arrière G" },
    { x: 35, y: 48, label: "Milieu" },
    { x: 50, y: 42, label: "Milieu" },
    { x: 65, y: 48, label: "Milieu" },
    { x: 90, y: 48, label: "Arrière D" },
    { x: 38, y: 22, label: "Buteur" },
    { x: 62, y: 22, label: "Buteur" },
  ],
  "4-2-3-1": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière G" },
    { x: 38, y: 72, label: "Défenseur" },
    { x: 62, y: 72, label: "Défenseur" },
    { x: 85, y: 70, label: "Arrière D" },
    { x: 35, y: 52, label: "Milieu D" },
    { x: 65, y: 52, label: "Milieu D" },
    { x: 15, y: 35, label: "Ailier G" },
    { x: 50, y: 32, label: "Milieu O" },
    { x: 85, y: 35, label: "Ailier D" },
    { x: 50, y: 15, label: "Buteur" },
  ],
  "5-3-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 10, y: 72, label: "Arrière G" },
    { x: 30, y: 72, label: "Défenseur" },
    { x: 50, y: 72, label: "Défenseur" },
    { x: 70, y: 72, label: "Défenseur" },
    { x: 90, y: 72, label: "Arrière D" },
    { x: 35, y: 45, label: "Milieu" },
    { x: 50, y: 42, label: "Milieu" },
    { x: 65, y: 45, label: "Milieu" },
    { x: 38, y: 22, label: "Buteur" },
    { x: 62, y: 22, label: "Buteur" },
  ],
};

const BENCH_SLOTS = ["R1", "R2", "R3", "R4", "R5"];

function benchLabels(count: number) {
  return Array.from({ length: count }, (_, i) => `R${i + 1}`);
}

function FeuilletMatchTab() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const supabase = createClient();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [formationName, setFormationName] = useState("4-3-3");
  const [presentPlayers, setPresentPlayers] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [benchAssignments, setBenchAssignments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadedFormationId, setLoadedFormationId] = useState<string | null>(null);
  const [pickingSlot, setPickingSlot] = useState<string | null>(null);
  const [captainId, setCaptainId] = useState<string | null>(null);

  const currentPositions = FORMATIONS[formationName] || FORMATIONS["4-3-3"];

  const assignedPlayerIds = new Set([
    ...Object.values(assignments),
    ...Object.values(benchAssignments),
  ]);

  const availablePlayers = presentPlayers.filter((p) => !assignedPlayerIds.has(p.id));
  const benchSize = Math.max(0, presentPlayers.length - 11);

  function assignToSlot(slotKey: string, playerId: string) {
    if (slotKey.startsWith("bench-")) {
      setBenchAssignments((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v === playerId) delete next[k];
        }
        for (const [k, v] of Object.entries(assignments)) {
          if (v === playerId) {
            setAssignments((a) => {
              const aNext = { ...a };
              delete aNext[k];
              return aNext;
            });
          }
        }
        next[slotKey] = playerId;
        return next;
      });
    } else {
      setAssignments((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(next)) {
          if (v === playerId) delete next[k];
        }
        for (const [k, v] of Object.entries(benchAssignments)) {
          if (v === playerId) {
            setBenchAssignments((b) => {
              const bNext = { ...b };
              delete bNext[k];
              return bNext;
            });
          }
        }
        next[slotKey] = playerId;
        return next;
      });
    }
    setPickingSlot(null);
  }

  function removeFromSlot(slotKey: string) {
    if (slotKey.startsWith("bench-")) {
      setBenchAssignments((prev) => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    } else {
      setAssignments((prev) => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
    }
    setPickingSlot(null);
  }

  function resetAssignments() {
    setAssignments({});
    setBenchAssignments({});
    setLoadedFormationId(null);
    setCaptainId(null);
  }

  // Fetch events
  useEffect(() => {
    if (!currentTeam) return;
    supabase
      .from("events")
      .select("*")
      .eq("team_id", currentTeam.id)
      .eq("type", "match")
      .order("event_date", { ascending: false })
      .then(({ data }) => {
        setEvents((data as Event[]) || []);
        setLoading(false);
      });
  }, [currentTeam]);

  // Fetch present players + existing formation when event changes
  useEffect(() => {
    if (!selectedEventId || !currentTeam) {
      setPresentPlayers([]);
      resetAssignments();
      return;
    }
    setLoadingPlayers(true);

    Promise.all([
      supabase
        .from("attendances")
        .select("profile:profiles!attendances_user_id_fkey(*)")
        .eq("event_id", selectedEventId)
        .eq("status", "present"),
      supabase
        .from("formations")
        .select("*")
        .eq("event_id", selectedEventId)
        .eq("team_id", currentTeam.id)
        .maybeSingle(),
    ]).then(([attendRes, formationRes]) => {
      // Set present players
      if (attendRes.data) {
        const players = attendRes.data
          .map((a: any) => a.profile as unknown as Profile | null)
          .filter((p): p is Profile => p !== null);
        setPresentPlayers(players);
      } else {
        setPresentPlayers([]);
      }

      // Load existing formation
      const existingFormation = formationRes.data as Formation | null;
      if (existingFormation?.formation_data) {
        setFormationName(existingFormation.name);
        setLoadedFormationId(existingFormation.id);
        const fd = existingFormation.formation_data as any;
        if (fd.positions) {
          const newAssignments: Record<string, string> = {};
          fd.positions.forEach((pos: any, i: number) => {
            if (pos.player_id) {
              newAssignments[`slot-${i}`] = pos.player_id;
            }
          });
          setAssignments(newAssignments);
        }
        setCaptainId(fd.captain_id || null);
      } else {
        resetAssignments();
      }

      setLoadingPlayers(false);
    });
  }, [selectedEventId, currentTeam]);

  async function handleSave() {
    if (!selectedEventId || !currentTeam) return;
    setSaving(true);
    const supabase = createClient();

    const positions = currentPositions.map((slot, i) => ({
      player_id: assignments[`slot-${i}`] || null,
      x: slot.x,
      y: slot.y,
      label: slot.label,
    }));

    const formationData: Record<string, any> = { positions };
    if (captainId) formationData.captain_id = captainId;

    if (loadedFormationId) {
      const { error } = await supabase
        .from("formations")
        .update({
          name: formationName,
          formation_data: formationData,
        })
        .eq("id", loadedFormationId);
      if (error) {
        toast.error("Erreur lors de la mise à jour");
      } else {
        toast.success("Feuillet mis à jour");
      }
    } else {
      const { data, error } = await supabase
        .from("formations")
        .insert({
          event_id: selectedEventId,
          name: formationName,
          formation_data: formationData,
          created_by: user?.id || null,
          is_default: true,
          team_id: currentTeam.id,
        })
        .select()
        .single();
      if (error) {
        toast.error("Erreur lors de la création");
      } else {
        setLoadedFormationId((data as any)?.id || null);
        toast.success("Feuillet enregistré");
      }
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!loadedFormationId) return;
    if (!confirm("Supprimer ce feuillet de match ?")) return;
    const { error } = await supabase
      .from("formations")
      .delete()
      .eq("id", loadedFormationId);
    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Feuillet supprimé");
      resetAssignments();
    }
  }

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  function playerById(id: string) {
    return presentPlayers.find((p) => p.id === id);
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center text-muted-foreground">Chargement...</div>;
  }

  if (!currentTeam) {
    return <div className="flex h-48 items-center justify-center text-muted-foreground">Chargement de l'équipe...</div>;
  }

  return (
    <div className="space-y-4 pb-20">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Match</Label>
          <Select
            value={selectedEventId}
            onValueChange={(v) => setSelectedEventId(v ?? "")}
          >
            <SelectTrigger className="w-full h-11">
              <SelectValue placeholder="Sélectionner un match">
                {(v) => {
                  if (!v) return "Sélectionner un match";
                  const ev = events.find((e) => e.id === v);
                  return ev
                    ? `${ev.title}${ev.opponent ? ` vs ${ev.opponent}` : ""}`
                    : v;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.title}
                  {ev.opponent ? ` vs ${ev.opponent}` : ""} —{" "}
                  {formatDate(ev.event_date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Formation</Label>
          <Select
            value={formationName}
            onValueChange={(v) => {
              setFormationName(v ?? "4-3-3");
              setAssignments({});
              setBenchAssignments({});
            }}
          >
            <SelectTrigger className="w-full h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(FORMATIONS).map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedEventId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Pitch */}
          <div className="lg:col-span-2 mx-auto w-full max-w-[200px] lg:max-w-none">
            <div className="relative aspect-[2/3] rounded-lg shadow-lg overflow-hidden bg-green-700">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px, transparent 40px, transparent 80px)",
                }}
              />
              <PitchSVG />
              {loadingPlayers ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                </div>
              ) : (
                currentPositions.map((slot, i) => {
                  const slotKey = `slot-${i}`;
                  const pid = assignments[slotKey];
                  const player = pid ? playerById(pid) : null;
                  return (
                    <div
                      key={i}
                      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center cursor-pointer"
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      onClick={() => setPickingSlot(slotKey)}
                    >
                      {player ? (
                        <div className="relative group">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-lg ring-2 ${player.id === captainId ? "bg-yellow-400 text-black ring-yellow-300" : "bg-[var(--color-royal)] text-white ring-white/20"}`}>
                            {player.shirt_number ?? "?"}
                            {player.id === captainId && <Crown className="ml-0.5 h-3 w-3" />}
                          </div>
                          <span className="mt-0.5 max-w-[64px] truncate text-[9px] font-medium text-white/90 drop-shadow text-center block">
                            {player.first_name.charAt(0)}. {player.last_name}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center opacity-70 hover:opacity-100 transition-opacity">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold border-2 border-dashed border-white/40 text-white/50 bg-white/5">
                            ?
                          </div>
                          <span className="mt-0.5 text-[8px] text-white/50 truncate max-w-[56px] text-center">
                            {slot.label}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bench */}
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Banc</h4>
              <div className="space-y-1.5">
                {benchLabels(benchSize).map((label, i) => {
                  const slotKey = `bench-${i}`;
                  const pid = benchAssignments[slotKey];
                  const player = pid ? playerById(pid) : null;
                  return (
                    <div
                      key={slotKey}
                      className="flex items-center gap-2.5 rounded-lg border bg-card p-2.5 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => setPickingSlot(slotKey)}
                    >
                      <span className="w-6 shrink-0 text-xs text-muted-foreground">{label}</span>
                      {player ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                            {player.shirt_number ?? "?"}
                          </span>
                          <span className="truncate font-medium text-sm flex-1">
                            {player.first_name} {player.last_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-xs">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!loadingPlayers && presentPlayers.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {Object.keys(assignments).length}/11 postes · {Object.keys(benchAssignments).length}/{benchSize} remplaçants
              </div>
            )}
          </div>
        </div>
      )}

      {/* Player picker dialog */}
      <Dialog open={pickingSlot !== null} onOpenChange={(open) => { if (!open) setPickingSlot(null); }}>
        <DialogContent className="max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {pickingSlot?.startsWith("bench-") ? "Choisir un remplaçant" : "Choisir un joueur"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {pickingSlot && (() => {
              const currentPid = pickingSlot.startsWith("bench-")
                ? benchAssignments[pickingSlot]
                : assignments[pickingSlot];
              const currentPlayer = currentPid ? playerById(currentPid) : null;
              return (
                <>
                  {currentPlayer && (
                    <>
                      <button
                        className="flex w-full items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => removeFromSlot(pickingSlot)}
                      >
                        <span>Retirer {currentPlayer.first_name} {currentPlayer.last_name}</span>
                      </button>
                      {!pickingSlot.startsWith("bench-") && (
                        <button
                          className={`flex w-full items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors ${captainId === currentPlayer.id ? "border-yellow-300 bg-yellow-50 text-yellow-800 hover:bg-yellow-100" : "border-card bg-card hover:bg-accent/50"}`}
                          onClick={() => {
                            setCaptainId(captainId === currentPlayer.id ? null : currentPlayer.id);
                            setPickingSlot(null);
                          }}
                        >
                          <Crown className={`h-4 w-4 ${captainId === currentPlayer.id ? "text-yellow-500" : "text-muted-foreground"}`} />
                          <span>{captainId === currentPlayer.id ? "Retirer le brassard" : "Définir comme capitaine"}</span>
                        </button>
                      )}
                    </>
                  )}
                  {availablePlayers.length === 0 && !currentPlayer && (
                    <p className="py-4 text-center text-sm text-muted-foreground">Aucun joueur disponible</p>
                  )}
                  {availablePlayers.map((p) => (
                    <button
                      key={p.id}
                      className="flex w-full items-center gap-2.5 rounded-lg border bg-card p-3 text-sm hover:bg-accent/50 transition-colors text-left"
                      onClick={() => assignToSlot(pickingSlot, p.id)}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">
                        {p.shirt_number ?? "?"}
                      </span>
                      <span className="truncate font-medium">{p.first_name} {p.last_name}</span>
                    </button>
                  ))}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {selectedEventId && (
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !selectedEventId}
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            >
              {saving ? "Enregistrement..." : "Enregistrer le feuillet"}
            </Button>
            {loadedFormationId && isCoach && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="text-destructive border-destructive hover:bg-destructive/10"
              >
                Supprimer
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {Object.keys(assignments).length}/11 postes attribués
          </p>
        </div>
      )}
    </div>
  );
}

// --- Page ----------------------------------------------------------------------

export default function TacticsPage() {
  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div>
        <h2 className="text-xl md:text-2xl font-bold">Tactique & Séances</h2>
        <p className="text-sm mt-1 text-muted-foreground">
          Gestion des entraînements et compositions d&apos;équipe
        </p>
      </div>

      <Tabs defaultValue="seance" className="space-y-4">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="seance" className="shrink-0"><ClipboardList className="h-4 w-4 mr-1.5" />Séance</TabsTrigger>
          <TabsTrigger value="match" className="shrink-0"><Swords className="h-4 w-4 mr-1.5" />Feuillet Match</TabsTrigger>
        </TabsList>
        <TabsContent value="seance">
          <SéanceTab />
        </TabsContent>
        <TabsContent value="match">
          <FeuilletMatchTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
