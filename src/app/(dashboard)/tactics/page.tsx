"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
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

const POSITION_LABELS = [
  "Gardien",
  "Défenseur Central",
  "Arrière Droit",
  "Arrière Gauche",
  "Milieu Défenseur",
  "Milieu Central",
  "Milieu Offensif",
  "Ailier Droit",
  "Ailier Gauche",
  "Buteur",
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

  const fetchData = useCallback(async () => {
    const [sessionsRes, eventsRes] = await Promise.all([
      supabase
        .from("training_sessions")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("*")
        .eq("type", "training")
        .order("event_date", { ascending: false }),
    ]);
    setSessions((sessionsRes.data as TrainingSession[]) || []);
    setEvents((eventsRes.data as Event[]) || []);
    setLoading(false);
  }, [supabase]);

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
            <DialogTrigger render={<Button size="sm" />}>
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
                      <SelectValue placeholder="Sélectionner un entraînement" />
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
                    <Button type="button" variant="outline" size="sm" onClick={addExercise}>
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
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={submitting}>
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
        <div className="grid gap-3 sm:grid-cols-2">
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
                    <Calendar className="h-4 w-4 text-muted-foreground" />
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

// --- Feuillet Match Tab --------------------------------------------------------

function FeuilletMatchTab() {
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";
  const supabase = createClient();

  const [lineups, setLineups] = useState<MatchLineup[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLineup, setSelectedLineup] = useState<{
    event: Event;
    formation: Formation;
    lineups: MatchLineup[];
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    event_id: "",
    formation_name: "4-3-3",
  });
  const [slotPlayerIds, setSlotPlayerIds] = useState<Record<number, string>>({});
  const [captainId, setCaptainId] = useState("");

  const fetchData = useCallback(async () => {
    const [lineupsRes, formationsRes, eventsRes, playersRes] = await Promise.all([
      supabase
        .from("match_lineups")
        .select("*, player:profiles(*)")
        .order("created_at", { ascending: false }),
      supabase
        .from("formations")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("*")
        .eq("type", "match")
        .order("event_date", { ascending: false }),
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
  }, [supabase]);

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

  const currentPositions = FORMATION_POSITIONS[form.formation_name] || FORMATION_POSITIONS["4-3-3"];
  const assignedPlayerIds = Object.values(slotPlayerIds).filter(Boolean);

  function setSlotPlayer(slotIndex: number, playerId: string | null) {
    setSlotPlayerIds((prev) => {
      const next = { ...prev };
      if (playerId) {
        next[slotIndex] = playerId;
      } else {
        delete next[slotIndex];
      }
      return next;
    });
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
      setSelectedLineup(null);
      fetchData();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.event_id) {
      toast.error("Sélectionnez un match");
      return;
    }

    const filledSlots = Object.values(slotPlayerIds).filter(Boolean);
    if (filledSlots.length !== currentPositions.length) {
      toast.error("Tous les postes doivent être remplis");
      return;
    }
    if (new Set(filledSlots).size !== filledSlots.length) {
      toast.error("Un joueur ne peut pas occuper deux postes");
      return;
    }

    setSubmitting(true);

    const positions = FORMATION_POSITIONS[form.formation_name] || FORMATION_POSITIONS["4-3-3"];
    const starterIds = Object.values(slotPlayerIds);

    const formationData = {
      positions: starterIds.map((pid, i) => ({
        player_id: pid,
        x: positions[i]?.x ?? 50,
        y: positions[i]?.y ?? 50,
        label: positions[i]?.label ?? "Joueur",
      })),
      ...(captainId ? { captain_id: captainId } : {}),
    };

    const { data: formation, error: fErr } = await supabase
      .from("formations")
      .insert({
        event_id: form.event_id,
        name: form.formation_name,
        formation_data: formationData,
        created_by: user?.id || null,
        is_default: true,
      })
      .select()
      .single();

    if (fErr || !formation) {
      toast.error("Erreur lors de la création de la formation");
      setSubmitting(false);
      return;
    }

    const substituteIds = players
      .filter((p) => !starterIds.includes(p.id))
      .map((p) => p.id);

    const lineupRows = [
      ...starterIds.map((pid, i) => ({
        event_id: form.event_id,
        player_id: pid,
        position_label: positions[i]?.label ?? null,
        is_starter: true,
        entered_at_minute: 0,
      })),
      ...substituteIds.map((pid) => ({
        event_id: form.event_id,
        player_id: pid,
        position_label: null,
        is_starter: false,
        entered_at_minute: null,
      })),
    ];

    const { error: lErr } = await supabase.from("match_lineups").insert(lineupRows);

    if (lErr) {
      toast.error("Erreur lors de la création des compositions");
    } else {
      toast.success("Feuillet de match créé");
      setCreateOpen(false);
      resetForm();
      fetchData();
    }
    setSubmitting(false);
  }

  function resetForm() {
    setForm({ event_id: "", formation_name: "4-3-3" });
    setSlotPlayerIds({});
    setCaptainId("");
  }

  if (selectedLineup) {
    const { event, formation, lineups: eventLineups } = selectedLineup;
    const starterLineups = eventLineups.filter((l) => l.is_starter);
    const subLineups = eventLineups.filter((l) => !l.is_starter);
    const positions = FORMATION_POSITIONS[formation.name] || FORMATION_POSITIONS["4-3-3"];
    const fd = formation.formation_data as { positions: { player_id: string; x: number; y: number; label: string }[]; captain_id?: string } | null;
    const captainIdVal = fd?.captain_id;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedLineup(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          {isCoach && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteFormation(formation.id, event.id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer
            </Button>
          )}
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-xl">{event.title}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(event.event_date)} — {event.opponent || "Adversaire inconnu"}
                </p>
              </div>
              <Badge variant="secondary">{formation.name}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="mx-auto max-w-md">
              <div className="relative aspect-[2/3] rounded-lg border-2 border-green-600 bg-green-700/20">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-green-600/50" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full border border-green-600/50" />
                <div className="absolute top-0 left-1/4 right-1/4 h-[15%] border border-green-600/50 border-t-0" />
                <div className="absolute bottom-0 left-1/4 right-1/4 h-[15%] border border-green-600/50 border-b-0" />

                {starterLineups.map((lineup, i) => {
                  const pos = positions[i];
                  const player = lineup.player as Profile | undefined;
                  const isCaptain = captainIdVal === lineup.player_id;
                  return (
                    <div
                      key={lineup.id}
                      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                      style={{ left: `${pos?.x ?? 50}%`, top: `${pos?.y ?? 50}%` }}
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-lg ${isCaptain ? "bg-yellow-500 text-black" : "bg-primary text-primary-foreground"}`}>
                        {player?.shirt_number ?? "?"}
                        {isCaptain && <Crown className="ml-0.5 h-3 w-3" />}
                      </div>
                      <span className="mt-0.5 max-w-[80px] truncate text-center text-[10px] font-medium text-foreground drop-shadow-md">
                        {player
                          ? `${player.first_name.charAt(0)}. ${player.last_name}`
                          : "N/A"}
                      </span>
                      <span className="text-[9px] text-green-200/80">
                        {lineup.position_label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Shirt className="h-4 w-4" />
                Titulaires
              </h4>
              <div className="space-y-1">
                {starterLineups.map((lineup) => {
                  const player = lineup.player as Profile | undefined;
                  const isCaptain = captainIdVal === lineup.player_id;
                  return (
                    <div
                      key={lineup.id}
                      className="flex items-center justify-between rounded border p-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-xs font-bold">
                          {player?.shirt_number ?? "?"}
                        </span>
                        <span>
                          {player?.first_name} {player?.last_name}
                        </span>
                        {isCaptain && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-xs">
                            <Crown className="mr-1 h-3 w-3" />
                            (C)
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {lineup.position_label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>

            {subLineups.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Remplaçants
                </h4>
                <div className="space-y-1">
                  {subLineups.map((lineup) => {
                    const player = lineup.player as Profile | undefined;
                    return (
                      <div
                        key={lineup.id}
                        className="flex items-center justify-between rounded border p-2 text-sm text-muted-foreground"
                      >
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-bold">
                            {player?.shirt_number ?? "?"}
                          </span>
                          <span>
                            {player?.first_name} {player?.last_name}
                          </span>
                        </div>
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {matchSheets.length} feuillet{matchSheets.length !== 1 ? "s" : ""}
        </p>
        {isCoach && (
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) resetForm();
            }}
          >
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-1 h-4 w-4" />
              Nouveau feuillet
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Créer un feuillet de match</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Match *</Label>
                  <Select
                    value={form.event_id}
                    onValueChange={(v) => setForm({ ...form, event_id: v ?? "" })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sélectionner un match" />
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

                <div className="space-y-2">
                  <Label>Formation</Label>
                  <Select
                    value={form.formation_name}
                    onValueChange={(v) => setForm({ ...form, formation_name: v ?? "4-3-3" })}
                  >
                    <SelectTrigger className="w-full">
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

                <div className="space-y-2">
                  <Label>Capitaine</Label>
                  <Select
                    value={captainId}
                    onValueChange={(v) => setCaptainId(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Aucun capitaine" />
                    </SelectTrigger>
                    <SelectContent>
                      {players
                        .filter((p) => assignedPlayerIds.includes(p.id))
                        .map((player) => (
                          <SelectItem key={player.id} value={player.id}>
                            #{player.shirt_number ?? "?"} {player.first_name}{" "}
                            {player.last_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>
                    Titulaires ({assignedPlayerIds.length}/{currentPositions.length})
                  </Label>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
                    {currentPositions.map((pos, slotIndex) => (
                      <div key={slotIndex} className="flex items-center gap-2">
                        <span className="w-40 shrink-0 truncate text-sm text-muted-foreground">
                          {pos.label}
                        </span>
                        <Select
                          value={slotPlayerIds[slotIndex] ?? ""}
                          onValueChange={(v) => setSlotPlayer(slotIndex, v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Choisir un joueur" />
                          </SelectTrigger>
                          <SelectContent>
                            {players.map((player) => {
                              const isAssignedElsewhere =
                                assignedPlayerIds.includes(player.id) &&
                                slotPlayerIds[slotIndex] !== player.id;
                              return (
                                <SelectItem
                                  key={player.id}
                                  value={player.id}
                                  disabled={isAssignedElsewhere}
                                >
                                  #{player.shirt_number ?? "?"} {player.first_name}{" "}
                                  {player.last_name}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
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
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={submitting}>
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
      ) : matchSheets.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          Aucun feuillet de match
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {matchSheets.map((sheet) => {
            const fd = sheet.formation.formation_data as { captain_id?: string } | null;
            const captainIdVal = fd?.captain_id;
            return (
              <Card
                key={sheet.formation.id}
                className="cursor-pointer transition-colors hover:bg-accent/50"
                onClick={() => setSelectedLineup(sheet)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-medium">{sheet.event.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {sheet.event.opponent
                          ? `vs ${sheet.event.opponent}`
                          : "Adversaire inconnu"}{" "}
                        — {formatDate(sheet.event.event_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
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
                            handleDeleteFormation(sheet.formation.id, sheet.event.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {sheet.lineups.filter((l) => l.is_starter).length} titulaire
                      {sheet.lineups.filter((l) => l.is_starter).length !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {sheet.lineups.filter((l) => !l.is_starter).length} remplaçant
                      {sheet.lineups.filter((l) => !l.is_starter).length !== 1 ? "s" : ""}
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Tactique & Séances</h2>
        <p className="mt-1 text-muted-foreground">
          Gestion des entraînements et compositions d&apos;équipe
        </p>
      </div>

      <Tabs defaultValue="seance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="seance">Séance</TabsTrigger>
          <TabsTrigger value="match">Feuillet Match</TabsTrigger>
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
