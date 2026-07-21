"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { useToast } from "@/hooks/use-toast";

interface Exercise {
  name: string;
  duration: number;
  description: string;
  drill_type: string;
}

interface SessionRecord {
  id: string;
  title: string;
  objectives: string[];
  exercises: Exercise[];
  notes: string;
  event_id: string | null;
}

export function SessionEditor() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [objectives, setObjectives] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [notes, setNotes] = useState("");
  const [savedSessions, setSavedSessions] = useState<SessionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("new");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/training-sessions")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSavedSessions(data);
        setLoading(false);
      });
  }, []);

  const loadSession = useCallback((sId: string) => {
    setSelectedId(sId);
    if (sId === "new") {
      setTitle("");
      setObjectives("");
      setExercises([]);
      setNotes("");
      return;
    }
    const found = savedSessions.find((s) => s.id === sId);
    if (found) {
      setTitle(found.title);
      setObjectives(found.objectives?.join(", ") || "");
      setExercises(found.exercises || []);
      setNotes(found.notes || "");
    }
  }, [savedSessions]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast({ title: "Erreur", description: "Donnez un titre à la séance", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title,
        objectives,
        exercises,
        notes,
      };
      const isEdit = selectedId && selectedId !== "new";
      const url = isEdit ? `/api/training-sessions/${selectedId}` : "/api/training-sessions";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({ title: "Sauvegardé", description: `"${title}" enregistrée` });
      if (!isEdit) {
        setSavedSessions((prev) => [{ id: data.id, ...data }, ...prev]);
        setSelectedId(data.id);
      }
    } catch (e) {
      toast({ title: "Erreur", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [title, objectives, exercises, notes, selectedId, toast]);

  const handleDelete = useCallback(async () => {
    if (!selectedId || selectedId === "new") return;
    const res = await fetch(`/api/training-sessions/${selectedId}`, { method: "DELETE" });
    if (res.ok) {
      setSavedSessions((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId("new");
      setTitle("");
      setObjectives("");
      setExercises([]);
      setNotes("");
      toast({ title: "Supprimée" });
    }
  }, [selectedId, toast]);

  function addExercise() {
    setExercises([...exercises, { name: "", duration: 15, description: "", drill_type: "warmup" }]);
  }

  function updateExercise(index: number, field: keyof Exercise, value: string | number) {
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)));
  }

  function removeExercise(index: number) {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Éditeur de séance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Sauvegardée</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedId}
                onChange={(e) => loadSession(e.target.value)}
              >
                <option value="new">+ Nouvelle séance</option>
                {savedSessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "..." : "Sauvegarder"}
            </Button>
            {selectedId && selectedId !== "new" && (
              <Button size="sm" variant="destructive" onClick={handleDelete}>
                Supprimer
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label>Titre de la séance</Label>
            <Input
              placeholder="Ex: Travail technique & tirs"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Objectifs (séparés par virgule)</Label>
            <Textarea
              placeholder="Ex: Améliorer le jeu de passes, finition"
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Exercices</Label>
              <Button size="sm" variant="outline" onClick={addExercise}>
                <Plus className="h-4 w-4 mr-1" />
                Ajouter
              </Button>
            </div>

            {exercises.map((ex, index) => (
              <div key={index} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Exercice {index + 1}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeExercise(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nom</Label>
                    <Input
                      placeholder="Nom de l'exercice"
                      value={ex.name}
                      onChange={(e) => updateExercise(index, "name", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Durée (min)</Label>
                    <Input
                      type="number"
                      value={ex.duration}
                      onChange={(e) => updateExercise(index, "duration", parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={ex.drill_type}
                      onChange={(e) => updateExercise(index, "drill_type", e.target.value)}
                    >
                      <option value="warmup">Échauffement</option>
                      <option value="technique">Technique</option>
                      <option value="tactique">Tactique</option>
                      <option value="physique">Physique</option>
                      <option value="jeu">Jeu</option>
                      <option value="tir">Tir / Finition</option>
                      <option value="cohesion">Cohésion</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    placeholder="Description de l'exercice..."
                    value={ex.description}
                    onChange={(e) => updateExercise(index, "description", e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              placeholder="Notes supplémentaires..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </RoleGuard>
  );
}
