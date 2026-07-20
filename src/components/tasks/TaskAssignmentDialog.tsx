"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Profile, Event } from "@/types";

interface TaskAssignmentDialogProps {
  events: Event[];
  onClose: () => void;
  onSaved: () => void;
}

export function TaskAssignmentDialog({
  events,
  onClose,
  onSaved,
}: TaskAssignmentDialogProps) {
  const [parents, setParents] = useState<Profile[]>([]);
  const [formData, setFormData] = useState({
    eventId: "",
    title: "",
    description: "",
    assignedTo: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchParents() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "parent")
        .eq("is_active", true)
        .order("last_name");
      setParents((data as Profile[]) || []);
    }
    fetchParents();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: formData.eventId,
          title: formData.title,
          description: formData.description || undefined,
          assignedTo: formData.assignedTo || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur");
        setLoading(false);
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError("Erreur de connexion");
      setLoading(false);
    }
  }

  const upcomingEvents = events.filter(
    (e) => e.status === "upcoming"
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive text-center">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label>Événement *</Label>
        <Select
          value={formData.eventId}
          onValueChange={(v) => setFormData({ ...formData, eventId: v ?? "" })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner un événement" />
          </SelectTrigger>
          <SelectContent>
            {upcomingEvents.map((event) => (
              <SelectItem key={event.id} value={event.id}>
                {event.title} —{" "}
                {new Date(event.event_date).toLocaleDateString("fr-FR")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Tâche *</Label>
        <Input
          id="title"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          placeholder="Ex: Lavage des maillots"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          placeholder="Détails optionnels..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Assigner à</Label>
        <Select
          value={formData.assignedTo}
          onValueChange={(v) => setFormData({ ...formData, assignedTo: v ?? "" })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Non assigné (rotation libre)" />
          </SelectTrigger>
          <SelectContent>
            {parents.map((parent) => (
              <SelectItem key={parent.id} value={parent.id}>
                {parent.first_name} {parent.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button
          type="submit"
          className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
          disabled={loading}
        >
          {loading ? "Création..." : "Créer la tâche"}
        </Button>
      </div>
    </form>
  );
}
