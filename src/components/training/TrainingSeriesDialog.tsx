"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CalendarRange, Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import type { AISession } from "@/lib/training/ai-generator";
import type { Exercise } from "@/types";

export function TrainingSeriesDialog({
  teamId,
  eventDate,
  eventTitle,
  fiche,
  open,
  onOpenChange,
  onCreated,
}: {
  teamId: string;
  eventDate: string;
  eventTitle: string;
  fiche: { title: string; source: "manual" | "ai"; exercises: AISession | Exercise[] | null; objectives: string[] | null; notes: string | null; visibility: "coach" | "team" } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [weeks, setWeeks] = useState(4);
  const [saving, setSaving] = useState(false);

  const sourceDate = new Date(eventDate);

  async function handleCreate() {
    if (weeks < 1 || weeks > 12) {
      toast.error("Choisis entre 1 et 12 semaines");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const hour = sourceDate.getHours();
      const minute = sourceDate.getMinutes();

      const dates: Date[] = [];
      for (let i = 1; i <= weeks; i++) {
        const d = new Date(sourceDate);
        d.setDate(d.getDate() + i * 7);
        d.setHours(hour, minute, 0, 0);
        dates.push(d);
      }

      const recurrenceGroupId = crypto.randomUUID();
      const rows = dates.map((d) => ({
        title: eventTitle,
        type: "training" as const,
        event_date: d.toISOString(),
        meeting_time: null,
        location: null,
        status: "upcoming" as const,
        team_id: teamId,
        convocation_lead_days: 3,
        recurrence_group_id: recurrenceGroupId,
      }));
      const { data: inserted, error } = await supabase
        .from("events")
        .insert(rows)
        .select("id");
      if (error) throw error;

      if (inserted && fiche && fiche.exercises) {
        const sessionRows = inserted.map((e: { id: string }) => ({
          event_id: e.id,
          team_id: teamId,
          title: fiche.title,
          objectives: fiche.objectives,
          exercises: fiche.exercises,
          notes: fiche.notes,
          source: fiche.source,
          visibility: fiche.visibility,
        }));
        const { error: sesError } = await supabase.from("training_sessions").insert(sessionRows);
        if (sesError) throw sesError;
      }

      toast.success(
        `${weeks} entraînement(s) programmé(s) chaque ${new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(sourceDate)}`
      );
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création de la série");
    } finally {
      setSaving(false);
    }
  }

  const startLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(datesForLabel());

  function datesForLabel() {
    const d = new Date(sourceDate);
    d.setDate(d.getDate() + 7);
    return d;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-[var(--color-gold)]" />
            Créer une série hebdomadaire
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{eventTitle}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {fiche
                ? "La fiche de séance actuelle sera copiée sur chaque entraînement de la série."
                : "Aucune fiche associée — les entraînements seront créés sans fiche."}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Nombre de semaines</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeeks(Math.max(1, weeks - 1))}
              >
                -
              </Button>
              <span className="text-lg font-bold flex-1 text-center">{weeks}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeeks(Math.min(12, weeks + 1))}
              >
                +
              </Button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" />
              Prochain : {startLabel}, puis chaque semaine au même horaire ({sourceDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Repeat className="h-4 w-4 mr-1" />
            )}
            {saving ? "Création..." : "Programmer la série"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
