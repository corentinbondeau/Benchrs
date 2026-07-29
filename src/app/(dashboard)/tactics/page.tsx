"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { toast } from "sonner";
import type {
  TrainingSession,
  Exercise,
  Formation,
  MatchLineup,
  Profile,
  Event,
} from "@/types";

const DRILL_TYPES = [
  "échauffement",
  "technique",
  "tactique",
  "physique",
  "jeu",
];

const FORMATION_POSITIONS: Record<string, { x: number; y: number; label: string }[]> = {
  "4-3-3": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière Gauche" },
    { x: 38, y: 72, label: "Défenseur Central" },
    { x: 62, y: 72, label: "Défenseur Central" },
    { x: 85, y: 70, label: "Arrière Droit" },
    { x: 30, y: 48, label: "Milieu Central" },
    { x: 50, y: 45, label: "Milieu Offensif" },
    { x: 70, y: 48, label: "Milieu Central" },
    { x: 15, y: 25, label: "Ailier Gauche" },
    { x: 50, y: 22, label: "Buteur" },
    { x: 85, y: 25, label: "Ailier Droit" },
  ],
  "4-4-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière Gauche" },
    { x: 38, y: 72, label: "Défenseur Central" },
    { x: 62, y: 72, label: "Défenseur Central" },
    { x: 85, y: 70, label: "Arrière Droit" },
    { x: 15, y: 45, label: "Ailier Gauche" },
    { x: 38, y: 48, label: "Milieu Central" },
    { x: 62, y: 48, label: "Milieu Central" },
    { x: 85, y: 45, label: "Ailier Droit" },
    { x: 38, y: 22, label: "Buteur" },
    { x: 62, y: 22, label: "Buteur" },
  ],
  "4-2-3-1": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière Gauche" },
    { x: 38, y: 72, label: "Défenseur Central" },
    { x: 62, y: 72, label: "Défenseur Central" },
    { x: 85, y: 70, label: "Arrière Droit" },
    { x: 35, y: 52, label: "Milieu Défenseur" },
    { x: 65, y: 52, label: "Milieu Défenseur" },
    { x: 15, y: 35, label: "Ailier Gauche" },
    { x: 50, y: 32, label: "Milieu Offensif" },
    { x: 85, y: 35, label: "Ailier Droit" },
    { x: 50, y: 15, label: "Buteur" },
  ],
  "3-5-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 25, y: 72, label: "Défenseur Central" },
    { x: 50, y: 72, label: "Défenseur Central" },
    { x: 75, y: 72, label: "Défenseur Central" },
    { x: 10, y: 48, label: "Arrière Gauche" },
    { x: 35, y: 48, label: "Milieu Central" },
    { x: 50, y: 42, label: "Milieu Offensif" },
    { x: 65, y: 48, label: "Milieu Central" },
    { x: 90, y: 48, label: "Arrière Droit" },
    { x: 38, y: 22, label: "Buteur" },
    { x: 62, y: 22, label: "Buteur" },
  ],
  "5-3-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 10, y: 72, label: "Arrière Gauche" },
    { x: 30, y: 72, label: "Défenseur Central" },
    { x: 50, y: 72, label: "Défenseur Central" },
    { x: 70, y: 72, label: "Défenseur Central" },
    { x: 90, y: 72, label: "Arrière Droit" },
    { x: 30, y: 45, label: "Milieu Central" },
    { x: 50, y: 42, label: "Milieu Offensif" },
    { x: 70, y: 45, label: "Milieu Central" },
    { x: 38, y: 22, label: "Buteur" },
    { x: 62, y: 22, label: "Buteur" },
  ],
  "3-4-3": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 25, y: 72, label: "Défenseur Central" },
    { x: 50, y: 72, label: "Défenseur Central" },
    { x: 75, y: 72, label: "Défenseur Central" },
    { x: 10, y: 48, label: "Arrière Gauche" },
    { x: 38, y: 48, label: "Milieu Central" },
    { x: 62, y: 48, label: "Milieu Central" },
    { x: 90, y: 48, label: "Arrière Droit" },
    { x: 15, y: 25, label: "Ailier Gauche" },
    { x: 50, y: 22, label: "Buteur" },
    { x: 85, y: 25, label: "Ailier Droit" },
  ],
  "2-5-3": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 35, y: 72, label: "Défenseur Central" },
    { x: 65, y: 72, label: "Défenseur Central" },
    { x: 10, y: 50, label: "Arrière Gauche" },
    { x: 30, y: 48, label: "Milieu Défenseur" },
    { x: 50, y: 42, label: "Milieu Offensif" },
    { x: 70, y: 48, label: "Milieu Défenseur" },
    { x: 90, y: 50, label: "Arrière Droit" },
    { x: 15, y: 25, label: "Ailier Gauche" },
    { x: 50, y: 22, label: "Buteur" },
    { x: 85, y: 25, label: "Ailier Droit" },
  ],
  "4-2-4": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière Gauche" },
    { x: 38, y: 72, label: "Défenseur Central" },
    { x: 62, y: 72, label: "Défenseur Central" },
    { x: 85, y: 70, label: "Arrière Droit" },
    { x: 35, y: 50, label: "Milieu Défenseur" },
    { x: 65, y: 50, label: "Milieu Défenseur" },
    { x: 15, y: 25, label: "Ailier Gauche" },
    { x: 38, y: 22, label: "Buteur" },
    { x: 62, y: 22, label: "Buteur" },
    { x: 85, y: 25, label: "Ailier Droit" },
  ],
  "4-1-2-1-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière Gauche" },
    { x: 38, y: 72, label: "Défenseur Central" },
    { x: 62, y: 72, label: "Défenseur Central" },
    { x: 85, y: 70, label: "Arrière Droit" },
    { x: 50, y: 55, label: "Milieu Défenseur" },
    { x: 32, y: 45, label: "Milieu Central" },
    { x: 68, y: 45, label: "Milieu Central" },
    { x: 50, y: 32, label: "Milieu Offensif" },
    { x: 38, y: 18, label: "Buteur" },
    { x: 62, y: 18, label: "Buteur" },
  ],
  "4-4-2 Diamond": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière Gauche" },
    { x: 38, y: 72, label: "Défenseur Central" },
    { x: 62, y: 72, label: "Défenseur Central" },
    { x: 85, y: 70, label: "Arrière Droit" },
    { x: 50, y: 55, label: "Milieu Défenseur" },
    { x: 30, y: 45, label: "Milieu Central" },
    { x: 70, y: 45, label: "Milieu Central" },
    { x: 50, y: 32, label: "Milieu Offensif" },
    { x: 38, y: 18, label: "Buteur" },
    { x: 62, y: 18, label: "Buteur" },
  ],
  "5-4-1": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 10, y: 72, label: "Arrière Gauche" },
    { x: 30, y: 72, label: "Défenseur Central" },
    { x: 50, y: 72, label: "Défenseur Central" },
    { x: 70, y: 72, label: "Défenseur Central" },
    { x: 90, y: 72, label: "Arrière Droit" },
    { x: 15, y: 45, label: "Ailier Gauche" },
    { x: 38, y: 48, label: "Milieu Central" },
    { x: 62, y: 48, label: "Milieu Central" },
    { x: 85, y: 45, label: "Ailier Droit" },
    { x: 50, y: 20, label: "Buteur" },
  ],
  "4-1-4-1": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 15, y: 70, label: "Arrière Gauche" },
    { x: 38, y: 72, label: "Défenseur Central" },
    { x: 62, y: 72, label: "Défenseur Central" },
    { x: 85, y: 70, label: "Arrière Droit" },
    { x: 50, y: 55, label: "Milieu Défenseur" },
    { x: 15, y: 42, label: "Ailier Gauche" },
    { x: 38, y: 45, label: "Milieu Central" },
    { x: 62, y: 45, label: "Milieu Central" },
    { x: 85, y: 42, label: "Ailier Droit" },
    { x: 50, y: 20, label: "Buteur" },
  ],
  "3-4-1-2": [
    { x: 50, y: 90, label: "Gardien" },
    { x: 25, y: 72, label: "Défenseur Central" },
    { x: 50, y: 72, label: "Défenseur Central" },
    { x: 75, y: 72, label: "Défenseur Central" },
    { x: 10, y: 48, label: "Arrière Gauche" },
    { x: 38, y: 48, label: "Milieu Central" },
    { x: 62, y: 48, label: "Milieu Central" },
    { x: 90, y: 48, label: "Arrière Droit" },
    { x: 50, y: 32, label: "Milieu Offensif" },
    { x: 38, y: 18, label: "Buteur" },
    { x: 62, y: 18, label: "Buteur" },
  ],
};

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
  const { currentTeam } = useTeam();
  const isCoach = user?.profile?.role === "coach";
  const supabase = createClient();

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    event_id: "",
    title: "",
    objectives: "",
    notes: "",
  });
  const [exercises, setExercises] = useState<Exercise[]>([
    { name: "", duration: 15, description: "", drill_type: "échauffement" },
  ]);

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l'équipe...</p></div>;
  }

  const fetchData = useCallback(async () => {
    const [sessionsRes, eventsRes] = await Promise.all([
      supabase
        .from("training_sessions")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .eq("type", "training")
        .order("event_date", { ascending: true }),
    ]);
    setSessions((sessionsRes.data as TrainingSession[]) || []);
    setEvents((eventsRes.data as Event[]) || []);
    setLoading(false);
  }, [supabase, currentTeam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
    const { error } = await supabase
      .from("training_sessions")
      .delete()
      .eq("id", selectedSession.id);
    if (error) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Séance supprimée");
      setSelectedSession(null);
      fetchData();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.event_id || !form.title) {
      toast.error("Veuillez remplir tous les champs obligatoires");
      return;
    }

    setSubmitting(true);
    const validExercises = exercises.filter((ex) => ex.name.trim() !== "");
    const objectives = form.objectives
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o !== "");

    const { error } = await supabase.from("training_sessions").insert({
      event_id: form.event_id,
      title: form.title,
      objectives: objectives.length > 0 ? objectives : null,
      exercises: validExercises.length > 0 ? validExercises : null,
      notes: form.notes || null,
      created_by: user?.id || null,
      team_id: currentTeam!.id,
    });

    if (error) {
      toast.error("Erreur lors de la création");
    } else {
      toast.success("Séance créée avec succès");
      setCreateOpen(false);
      resetForm();
      fetchData();
    }
    setSubmitting(false);
  }

  function resetForm() {
    setForm({ event_id: "", title: "", objectives: "", notes: "" });
    setExercises([{ name: "", duration: 15, description: "", drill_type: "échauffement" }]);
  }

  const eventMap = new Map(events.map((ev) => [ev.id, ev]));

  if (selectedSession) {
    const event = eventMap.get(selectedSession.event_id);
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
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">{selectedSession.title}</CardTitle>
                {event && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {event.title} — {formatDate(event.event_date)}
                  </p>
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

            {selectedSession.exercises && selectedSession.exercises.length > 0 && (
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
            )}

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

                <div className="space-y-2">
                  <Label>Titre *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Ex: Séance technique"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Objectifs (séparés par des virgules)</Label>
                  <Input
                    value={form.objectives}
                    onChange={(e) => setForm({ ...form, objectives: e.target.value })}
                    placeholder="Ex: passes, protection balle, pressing"
                  />
                </div>

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
                    {submitting ? "Création..." : "Créer"}
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
            return (
              <Card
                key={session.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => setSelectedSession(session)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-medium">{session.title}</h3>
                      {event && (
                        <p className="text-sm text-muted-foreground">
                          {event.title} — {formatDate(event.event_date)}
                        </p>
                      )}
                    </div>
                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {session.exercises && session.exercises.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {session.exercises.length} exercice
                        {session.exercises.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
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

function FeuilletMatchTab() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const isCoach = user?.profile?.role === "coach";
  const supabase = createClient();

  const [lineups, setLineups] = useState<MatchLineup[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSheet, setSelectedSheet] = useState<{
    event: Event;
    formation: Formation;
    lineups: MatchLineup[];
  } | null>(null);

  const [createMode, setCreateMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [formationName, setFormationName] = useState("4-3-3");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [captainId, setCaptainId] = useState("");

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l'équipe...</p></div>;
  }

  const fetchData = useCallback(async () => {
    const [lineupsRes, formationsRes, eventsRes, playersRes] = await Promise.all([
      supabase
        .from("match_lineups")
        .select("*, player:profiles(*)")
        .eq("team_id", currentTeam!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("formations")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .eq("type", "match")
        .order("event_date", { ascending: true }),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .eq("is_active", true)
        .order("last_name", { ascending: true }),
    ]);
    setLineups((lineupsRes.data as MatchLineup[]) || []);
    setFormations((formationsRes.data as Formation[]) || []);
    setEvents((eventsRes.data as Event[]) || []);
    setPlayers((playersRes.data as Profile[]) || []);
    setLoading(false);
  }, [supabase, currentTeam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const eventMap = new Map(events.map((ev) => [ev.id, ev]));

  const matchSheets = formations
    .filter((f) => {
      const ev = eventMap.get(f.event_id);
      return ev?.type === "match";
    })
    .map((f) => {
      const ev = eventMap.get(f.event_id)!;
      const eventLineups = lineups.filter((l) => l.event_id === f.event_id);
      return { event: ev, formation: f, lineups: eventLineups };
    });

  const currentPositions = FORMATION_POSITIONS[formationName] || FORMATION_POSITIONS["4-3-3"];

  const allSlotKeys = [
    ...currentPositions.map((_, i) => `slot-${i}`),
    ...["bench-0", "bench-1", "bench-2"],
  ];
  const assignedPlayers = new Set(Object.values(assignments));

  function handleAssign(slotKey: string, playerId: string) {
    setAssignments((prev) => {
      const next = { ...prev };
      const oldSlotForThisPlayer = Object.entries(next).find(
        ([k, v]) => v === playerId && k !== slotKey
      );
      if (oldSlotForThisPlayer) delete next[oldSlotForThisPlayer[0]];
      const oldPlayerInThisSlot = Object.entries(next).find(
        ([k, v]) => k !== playerId && v === slotKey
      );
      if (oldPlayerInThisSlot) delete next[oldPlayerInThisSlot[0]];
      if (playerId) next[slotKey] = playerId;
      else delete next[slotKey];
      return next;
    });
  }

  function availablePlayers(currentSlot: string) {
    const currentPlayerId = assignments[currentSlot];
    return players.filter(
      (p) =>
        p.id === currentPlayerId || !assignedPlayers.has(p.id)
    );
  }

  function formatPlayer(p: Profile) {
    return `#${p.shirt_number ?? "?"} ${p.first_name} ${p.last_name}`;
  }

  function playerBySlot(slotKey: string): Profile | undefined {
    const pid = assignments[slotKey];
    return pid ? players.find((p) => p.id === pid) : undefined;
  }

  function resetCreateMode() {
    setCreateMode(false);
    setSelectedEventId("");
    setFormationName("4-3-3");
    setAssignments({});
    setCaptainId("");
  }

  async function handleCreate() {
    if (!selectedEventId) {
      toast.error("Sélectionnez un match");
      return;
    }

    const starterIds = currentPositions.map((_, i) => assignments[`slot-${i}`]);
    if (starterIds.some((id) => !id)) {
      toast.error("Tous les postes doivent être remplis");
      return;
    }

    const benchIds = [0, 1, 2].map((i) => assignments[`bench-${i}`]);
    if (benchIds.some((id) => !id)) {
      toast.error("Le banc doit comporter 3 remplaçants");
      return;
    }

    const allIds = [...starterIds, ...benchIds];
    if (new Set(allIds).size !== allIds.length) {
      toast.error("Un joueur ne peut pas occuper deux postes");
      return;
    }

    setSubmitting(true);

    const positions =
      FORMATION_POSITIONS[formationName] || FORMATION_POSITIONS["4-3-3"];

    const formationData = {
      positions: starterIds.map((pid, i) => ({
        player_id: pid!,
        x: positions[i].x,
        y: positions[i].y,
        label: positions[i].label,
      })),
      ...(captainId ? { captain_id: captainId } : {}),
    };

    const { data: formation, error: fErr } = await supabase
      .from("formations")
      .insert({
        event_id: selectedEventId,
        name: formationName,
        formation_data: formationData,
        created_by: user?.id || null,
        is_default: true,
        team_id: currentTeam!.id,
      })
      .select()
      .single();

    if (fErr || !formation) {
      toast.error("Erreur lors de la création de la formation");
      setSubmitting(false);
      return;
    }

    const lineupRows = [
      ...starterIds.map((pid, i) => ({
        event_id: selectedEventId,
        player_id: pid!,
        position_label: positions[i].label,
        is_starter: true,
        entered_at_minute: 0,
        team_id: currentTeam!.id,
      })),
      ...benchIds.map((pid) => ({
        event_id: selectedEventId,
        player_id: pid,
        position_label: null as string | null,
        is_starter: false,
        entered_at_minute: null as number | null,
        team_id: currentTeam!.id,
      })),
    ];

    const { error: lErr } = await supabase.from("match_lineups").insert(lineupRows);

    if (lErr) {
      toast.error("Erreur lors de la création des compositions");
    } else {
      toast.success("Feuillet de match créé");
      resetCreateMode();
      fetchData();
    }
    setSubmitting(false);
  }

  async function handleDeleteFormation(formationId: string, eventId: string) {
    if (!confirm("Supprimer ce feuillet de match ?")) return;
    const [fErr] = await Promise.all([
      supabase.from("formations").delete().eq("id", formationId),
      supabase.from("match_lineups").delete().eq("event_id", eventId),
    ]);
    if (fErr) {
      toast.error("Erreur lors de la suppression");
    } else {
      toast.success("Feuillet supprimé");
      setSelectedSheet(null);
      fetchData();
    }
  }

  // --- Create Mode ---

  if (createMode) {
    return (
      <div className="space-y-5 pb-20">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetCreateMode}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
        </div>

        <div className="space-y-3">
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
                setCaptainId("");
              }}
            >
              <SelectTrigger className="w-full h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(FORMATION_POSITIONS).map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mx-auto max-w-[240px]">
          <div className="relative aspect-[2/3] rounded-lg shadow-lg overflow-hidden bg-green-700">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px, transparent 40px, transparent 80px)",
              }}
            />
            <PitchSVG />
            {currentPositions.map((pos, i) => {
              const player = playerBySlot(`slot-${i}`);
              const isCapt = captainId === player?.id;
              return (
                <div
                  key={i}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-lg ${
                      isCapt
                        ? "bg-yellow-400 text-black ring-2 ring-yellow-300"
                        : player
                          ? "bg-[var(--color-royal)] text-white"
                          : "border-2 border-dashed border-white/30 text-white/40 text-[9px]"
                    }`}
                  >
                    {player ? (
                      <>
                        {player.shirt_number ?? "?"}
                        {isCapt && <Crown className="ml-0.5 h-3 w-3" />}
                      </>
                    ) : (
                      "?"
                    )}
                  </div>
                  <span className="mt-0.5 max-w-[64px] truncate text-[9px] font-medium text-white/90 drop-shadow text-center">
                    {player
                      ? `${player.first_name.charAt(0)}. ${player.last_name}`
                      : pos.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shirt className="h-4 w-4" />
              Titulaires
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {currentPositions.map((pos, i) => {
              const slotKey = `slot-${i}`;
              const player = playerBySlot(slotKey);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{pos.label}</span>
                  <div className="flex-1">
                    <Select
                      value={player?.id ?? ""}
                      onValueChange={(v) => handleAssign(slotKey, v ?? "")}
                    >
                      <SelectTrigger className="w-full h-10">
                        <SelectValue placeholder="—">
                          {(v) => {
                            if (!v) return "—";
                            const p = players.find((pl) => pl.id === v);
                            return p ? formatPlayer(p) : v;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlayers(slotKey).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            #{p.shirt_number ?? "?"} {p.first_name} {p.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              Remplaçants
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[0, 1, 2].map((i) => {
              const slotKey = `bench-${i}`;
              const player = playerBySlot(slotKey);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">R{i + 1}</span>
                  <div className="flex-1">
                    <Select
                      value={player?.id ?? ""}
                      onValueChange={(v) => handleAssign(slotKey, v ?? "")}
                    >
                      <SelectTrigger className="w-full h-10">
                        <SelectValue placeholder="—">
                          {(v) => {
                            if (!v) return "—";
                            const p = players.find((pl) => pl.id === v);
                            return p ? formatPlayer(p) : v;
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlayers(slotKey).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            #{p.shirt_number ?? "?"} {p.first_name} {p.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Capitaine</Label>
          <Select
            value={captainId}
            onValueChange={(v) => setCaptainId(v ?? "")}
          >
            <SelectTrigger className="w-full h-11">
              <SelectValue placeholder="Aucun capitaine">
                {(v) => {
                  if (!v) return "Aucun capitaine";
                  const p = players.find((pl) => pl.id === v);
                  return p ? formatPlayer(p) : v;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {players
                .filter((p) => assignedPlayers.has(p.id))
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    #{p.shirt_number ?? "?"} {p.first_name} {p.last_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={resetCreateMode}
            className="flex-1 border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
          >
            Annuler
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting}
            className="flex-1 bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
          >
            {submitting ? "Création..." : "Créer le feuillet"}
          </Button>
        </div>
      </div>
    );
  }

  // --- Detail Mode ---

  if (selectedSheet) {
    const { event, formation, lineups: eventLineups } = selectedSheet;
    const starterLineups = eventLineups.filter((l) => l.is_starter);
    const subLineups = eventLineups.filter((l) => !l.is_starter);
    const positions =
      FORMATION_POSITIONS[formation.name] || FORMATION_POSITIONS["4-3-3"];
    const fd = formation.formation_data as {
      positions: {
        player_id: string;
        x: number;
        y: number;
        label: string;
      }[];
      captain_id?: string;
    } | null;
    const captainIdVal = fd?.captain_id;

    return (
      <div className="space-y-4 pb-20">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedSheet(null)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          {isCoach && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() =>
                handleDeleteFormation(formation.id, event.id)
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          )}
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{event.title}</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {formatDate(event.event_date)} —{" "}
                  {event.opponent || "Adversaire inconnu"}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">{formation.name}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="mx-auto max-w-[240px]">
              <div className="relative aspect-[2/3] rounded-lg shadow-lg overflow-hidden bg-green-700">
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 40px, transparent 40px, transparent 80px)",
                  }}
                />
                <PitchSVG />
                {starterLineups.map((lineup, i) => {
                  const pos = positions[i];
                  const player = lineup.player as Profile | undefined;
                  const isCaptain = captainIdVal === lineup.player_id;
                  return (
                    <div
                      key={lineup.id}
                      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                      style={{
                        left: `${pos?.x ?? 50}%`,
                        top: `${pos?.y ?? 50}%`,
                      }}
                    >
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-lg ${
                          isCaptain
                            ? "bg-yellow-400 text-black ring-2 ring-yellow-300"
                            : "bg-[var(--color-royal)] text-white"
                        }`}
                      >
                        {player?.shirt_number ?? "?"}
                        {isCaptain && (
                          <Crown className="ml-0.5 h-3 w-3" />
                        )}
                      </div>
                      <span className="mt-0.5 max-w-[64px] truncate text-center text-[9px] font-medium text-foreground drop-shadow-md">
                        {player
                          ? `${player.first_name.charAt(0)}. ${player.last_name}`
                          : "N/A"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                <Shirt className="h-4 w-4" />
                Titulaires
              </h4>
              <div className="space-y-1.5">
                {starterLineups.map((lineup) => {
                  const player = lineup.player as Profile | undefined;
                  const isCaptain = captainIdVal === lineup.player_id;
                  return (
                    <div
                      key={lineup.id}
                      className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold">
                          {player?.shirt_number ?? "?"}
                        </span>
                        <span className="truncate font-medium">
                          {player?.first_name} {player?.last_name}
                        </span>
                        {isCaptain && (
                          <Crown className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0 ml-2">
                        {lineup.position_label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {subLineups.length > 0 && (
              <div>
                <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4" />
                  Remplaçants
                </h4>
                <div className="space-y-1.5">
                  {subLineups.map((lineup) => {
                    const player = lineup.player as Profile | undefined;
                    return (
                      <div
                        key={lineup.id}
                        className="flex items-center gap-2.5 rounded-lg border bg-card p-3 text-sm text-muted-foreground"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                          {player?.shirt_number ?? "?"}
                        </span>
                        <span className="truncate font-medium">
                          {player?.first_name} {player?.last_name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- List Mode ---

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {matchSheets.length} feuillet
          {matchSheets.length !== 1 ? "s" : ""}
        </p>
        {isCoach && (
          <Button
            size="sm"
            onClick={() => setCreateMode(true)}
            className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
          >
            <Plus className="mr-1 h-4 w-4" />
            Nouveau feuillet
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          Chargement...
        </div>
      ) : matchSheets.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          Aucun feuillet de match
        </div>
      ) : (
        <div className="space-y-3">
          {matchSheets.map((sheet) => {
            const fd = sheet.formation.formation_data as {
              captain_id?: string;
            } | null;
            const captainIdVal = fd?.captain_id;
            return (
              <Card
                key={sheet.formation.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => setSelectedSheet(sheet)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0">
                      <h3 className="font-medium truncate">
                        {sheet.event.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {sheet.event.opponent
                          ? `vs ${sheet.event.opponent}`
                          : "Adversaire inconnu"}{" "}
                        — {formatDate(sheet.event.event_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="secondary">
                        {sheet.formation.name}
                        {captainIdVal && " (C)"}
                      </Badge>
                      {isCoach && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFormation(
                              sheet.formation.id,
                              sheet.event.id
                            );
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {sheet.lineups.filter((l) => l.is_starter).length}{" "}
                      titulaire
                      {sheet.lineups.filter((l) => l.is_starter).length !==
                      1
                        ? "s"
                        : ""}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {sheet.lineups.filter((l) => !l.is_starter).length}{" "}
                      remplaçant
                      {sheet.lineups.filter((l) => !l.is_starter).length !==
                      1
                        ? "s"
                        : ""}
                    </Badge>
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
