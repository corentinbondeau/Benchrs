"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { TrainingTemplate } from "@/types";

export interface TemplateFichePayload {
  name: string;
  source: "manual" | "ai";
  exercises: unknown;
  objectives: string[] | null;
  notes: string | null;
  visibility: "coach" | "team";
}

export function TrainingTemplatesDialog({
  teamId,
  open,
  onOpenChange,
  ficheForSave,
  onApply,
}: {
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ficheForSave: TemplateFichePayload | null;
  onApply: (template: TrainingTemplate) => Promise<void>;
}) {
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("training_templates")
      .select("*")
      .eq("team_id", teamId)
      .order("updated_at", { ascending: false });
    return (data as TrainingTemplate[] | null) ?? [];
  }, [teamId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadData()
      .then((res) => {
        if (!cancelled) setTemplates(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadData]);

  async function handleSaveTemplate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Donne un nom au modèle");
      return;
    }
    if (!ficheForSave) {
      toast.error("Aucune fiche à sauvegarder");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("training_templates").insert({
        team_id: teamId,
        name: trimmed,
        source: ficheForSave.source,
        exercises: ficheForSave.exercises,
        objectives: ficheForSave.objectives,
        notes: ficheForSave.notes,
        visibility: ficheForSave.visibility,
      });
      if (error) throw error;
      setName("");
      const fresh = await loadData();
      setTemplates(fresh);
      toast.success(`Modèle « ${trimmed} » enregistré`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("training_templates").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("Modèle supprimé");
  }

  async function handleApply(t: TrainingTemplate) {
    setApplyingId(t.id);
    try {
      await onApply(t);
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-[var(--color-gold)]" />
            Modèles de séance
          </DialogTitle>
        </DialogHeader>

        {ficheForSave && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Save className="h-3.5 w-3.5" /> Sauvegarder la fiche actuelle
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Séance type mercredi — conservation"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSaveTemplate();
                  }
                }}
              />
              <Button
                size="sm"
                className="bg-[var(--color-primary-blue)] text-white font-semibold shrink-0"
                onClick={handleSaveTemplate}
                disabled={saving || !name.trim()}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1" />
                )}
                Créer
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-xs font-semibold">Modèles de l&apos;équipe</Label>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun modèle pour le moment.
            </p>
          ) : (
            <div className="space-y-2">
              {templates.map((t) => {
                const sections = (t.exercises as { sections?: unknown[] } | null)?.sections ?? null;
                const count = t.source === "ai" ? (sections?.length ?? 0) : Array.isArray(t.exercises) ? t.exercises.length : 0;
                return (
                  <div
                    key={t.id}
                    className="rounded-lg border p-3 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <Badge
                          className={
                            t.source === "ai"
                              ? "bg-[var(--color-gold)]/20 text-[var(--color-gold)] border-[var(--color-gold)]/30 shrink-0"
                              : "bg-blue-50 text-blue-700 border-blue-200 shrink-0"
                          }
                        >
                          {t.source === "ai" ? (
                            <Sparkles className="h-3 w-3 mr-0.5" />
                          ) : null}
                          {t.source === "ai" ? "IA" : "Manuel"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.source === "ai"
                          ? `${count} section(s) · fiche IA`
                          : `${count} exercice(s)`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleApply(t)}
                        disabled={applyingId === t.id}
                      >
                        {applyingId === t.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Save className="h-3.5 w-3.5 mr-1" />
                        )}
                        Utiliser
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
