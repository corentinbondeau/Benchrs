"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/layout/RoleGuard";

interface Exercise {
  name: string;
  duration: number;
  description: string;
  drill_type: string;
}

export function SessionEditor() {
  const [title, setTitle] = useState("");
  const [objectives, setObjectives] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [notes, setNotes] = useState("");

  function addExercise() {
    setExercises([
      ...exercises,
      { name: "", duration: 15, description: "", drill_type: "warmup" },
    ]);
  }

  function updateExercise(
    index: number,
    field: keyof Exercise,
    value: string | number
  ) {
    setExercises((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  }

  function removeExercise(index: number) {
    setExercises((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Éditeur de séance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Titre de la séance</Label>
            <Input
              placeholder="Ex: Travail technique & tirs"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Objectifs</Label>
            <Textarea
              placeholder="Décrivez les objectifs de cette séance..."
              value={objectives}
              onChange={(e) => setObjectives(e.target.value)}
              rows={3}
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
              <div
                key={index}
                className="rounded-lg border p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Exercice {index + 1}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeExercise(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nom</Label>
                    <Input
                      placeholder="Nom de l'exercice"
                      value={ex.name}
                      onChange={(e) =>
                        updateExercise(index, "name", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Durée (min)</Label>
                    <Input
                      type="number"
                      value={ex.duration}
                      onChange={(e) =>
                        updateExercise(
                          index,
                          "duration",
                          parseInt(e.target.value) || 0
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    placeholder="Description de l'exercice..."
                    value={ex.description}
                    onChange={(e) =>
                      updateExercise(index, "description", e.target.value)
                    }
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

          <Button className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90">
            Enregistrer la séance
          </Button>
        </CardContent>
      </Card>
    </RoleGuard>
  );
}
