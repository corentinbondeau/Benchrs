"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, Star } from "lucide-react";
import { toast } from "sonner";

export interface MatchNotebookInitial {
  performance?: number;
  notable_events?: string | null;
  improvements?: string | null;
  notes?: string | null;
}

interface MatchNotebookFormProps {
  playerId: string;
  teamId: string;
  eventId: string;
  initial?: MatchNotebookInitial | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5"
          aria-label={`${n}/10`}
        >
          <Star
            className={`h-5 w-5 ${
              n <= value
                ? "fill-[var(--color-gold)] text-[var(--color-gold)]"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
      <span className="ml-1 text-xs font-semibold">{value}/10</span>
    </div>
  );
}

export function MatchNotebookForm({
  playerId,
  teamId,
  eventId,
  initial,
  onSaved,
  onCancel,
}: MatchNotebookFormProps) {
  const [performance, setPerformance] = useState(initial?.performance ?? 5);
  const [notable, setNotable] = useState(initial?.notable_events ?? "");
  const [improvements, setImprovements] = useState(initial?.improvements ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        player_id: playerId,
        team_id: teamId,
        event_id: eventId,
        performance,
        notable_events: notable.trim() || null,
        improvements: improvements.trim() || null,
        notes: notes.trim() || null,
      };
      const { error } = await supabase
        .from("player_notebook_entries")
        .upsert(payload, { onConflict: "player_id,event_id" });
      if (error) throw error;
      toast.success("Carnet mis à jour");
      onSaved?.();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
      <div className="space-y-2">
        <Label htmlFor={`perf-${eventId}`}>Ma prestation</Label>
        <StarRow value={performance} onChange={setPerformance} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`nbNotable-${eventId}`}>Ce que j&apos;ai bien fait</Label>
        <Textarea
          id={`nbNotable-${eventId}`}
          value={notable}
          onChange={(e) => setNotable(e.target.value)}
          placeholder="Mes points forts du match..."
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`nbImprove-${eventId}`}>Mes axes de progression</Label>
        <Textarea
          id={`nbImprove-${eventId}`}
          value={improvements}
          onChange={(e) => setImprovements(e.target.value)}
          placeholder="Ce que je veux améliorer..."
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`nbNotes-${eventId}`}>Mes impressions</Label>
        <Input
          id={`nbNotes-${eventId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ressenti, contexte..."
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-8" onClick={handleSave} disabled={saving}>
          {saving ? "..." : <><Check className="h-3.5 w-3.5 mr-1" /> Enregistrer</>}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}