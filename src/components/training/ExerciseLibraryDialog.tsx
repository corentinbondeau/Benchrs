"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DRILL_TYPES } from "@/lib/training/exercises";
import type { Exercise, ExerciseLibrary } from "@/types";

const FILTERS = ["", ...DRILL_TYPES];

export function ExerciseLibraryDialog({
  teamId,
  open,
  onOpenChange,
  onAdd,
  isCoach,
}: {
  teamId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (ex: Exercise) => void;
  isCoach: boolean;
}) {
  const [items, setItems] = useState<ExerciseLibrary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDuration, setNewDuration] = useState(15);
  const [newDrillType, setNewDrillType] = useState<string>("technique");
  const [adding, setAdding] = useState(false);

  const loadLibrary = useCallback(async (): Promise<ExerciseLibrary[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("exercise_library")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    return (data as ExerciseLibrary[]) || [];
  }, [teamId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadLibrary().then((res) => {
      if (cancelled) return;
      setItems(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, loadLibrary]);

  async function handleAddToLibrary() {
    if (!newName.trim()) {
      toast.error("Donne un nom à l'exercice");
      return;
    }
    setAdding(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("exercise_library")
      .insert({
        team_id: teamId,
        name: newName.trim(),
        duration: newDuration,
        description: newDescription.trim() || null,
        drill_type: newDrillType,
      })
      .select()
      .single();
    setAdding(false);
    if (error) {
      toast.error("Erreur lors de l'ajout à la bibliothèque");
      return;
    }
    setItems((prev) => [data as ExerciseLibrary, ...prev]);
    setNewName("");
    setNewDescription("");
    setNewDuration(15);
    setNewDrillType("technique");
    toast.success("Exercice ajouté à la bibliothèque");
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("exercise_library").delete().eq("id", id);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Exercice supprimé de la bibliothèque");
  }

  function handleUse(ex: ExerciseLibrary) {
    onAdd({
      name: ex.name,
      duration: ex.duration,
      description: ex.description || "",
      drill_type: ex.drill_type,
    });
    toast.success("Exercice ajouté à la séance");
  }

  const filtered = items.filter((i) => {
    const matchesSearch = search.trim() === "" || i.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "" || i.drill_type === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bibliothèque d&apos;exercices</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="pl-8"
              />
            </div>
            <select
              className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filtrer par type"
            >
              {FILTERS.map((f) => (
                <option key={f} value={f}>{f === "" ? "Tous" : f}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {items.length === 0
                ? "Aucun exercice enregistré pour le moment."
                : "Aucun exercice ne correspond à la recherche."}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {item.drill_type}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {item.duration} min
                      </span>
                    </div>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleUse(item)}
                    className="shrink-0 border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Ajouter
                  </Button>
                  {isCoach && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => handleDelete(item.id)}
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isCoach && (
            <div className="rounded-lg border border-dashed p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Ajouter à la bibliothèque
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom de l'exercice"
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={newDuration}
                  onChange={(e) => setNewDuration(parseInt(e.target.value) || 15)}
                  className="w-16"
                  aria-label="Durée"
                />
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
                  value={newDrillType}
                  onChange={(e) => setNewDrillType(e.target.value)}
                  aria-label="Type"
                >
                  {DRILL_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddToLibrary}
                  disabled={adding}
                  className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
                >
                  {adding ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                  Ajouter
                </Button>
              </div>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Consignes, organisation (optionnel)"
                rows={2}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
