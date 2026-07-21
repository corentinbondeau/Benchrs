"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EventFormProps {
  onCreated?: () => void;
}

export function EventForm({ onCreated }: EventFormProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: "match" as "match" | "training" | "social" | "other",
    title: "",
    description: "",
    event_date: "",
    event_time: "",
    end_date: "",
    location: "",
    opponent: "",
  });

  const isCoach = session?.user?.role === "coach";

  if (!isCoach) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const eventDate = form.event_date && form.event_time
        ? new Date(`${form.event_date}T${form.event_time}`).toISOString()
        : form.event_date;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          description: form.description || null,
          event_date: eventDate,
          end_date: form.end_date || null,
          location: form.location || null,
          opponent: form.opponent || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      toast({ title: "Événement créé" });
      setOpen(false);
      setForm({ type: "match", title: "", description: "", event_date: "", event_time: "", end_date: "", location: "", opponent: "" });
      onCreated?.();
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90" />}>
        <Plus className="h-4 w-4 mr-1" />
        Événement
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer un événement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="match">⚽ Match</SelectItem>
                <SelectItem value="training">🏃 Entraînement</SelectItem>
                <SelectItem value="social">🎉 Événement social</SelectItem>
                <SelectItem value="other">📋 Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Titre *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Match vs Racing Club"
              required
            />
          </div>

          {form.type === "match" && (
            <div className="space-y-2">
              <Label>Adversaire</Label>
              <Input
                value={form.opponent}
                onChange={(e) => setForm({ ...form, opponent: e.target.value })}
                placeholder="Nom de l'adversaire"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Heure</Label>
              <Input
                type="time"
                value={form.event_time}
                onChange={(e) => setForm({ ...form, event_time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lieu</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Stade / Terrain"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Informations complémentaires..."
              rows={3}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
            disabled={loading || !form.title || !form.event_date}
          >
            {loading ? "Création..." : "Créer l'événement"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
