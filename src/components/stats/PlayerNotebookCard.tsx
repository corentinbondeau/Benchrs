"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Star, Check, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { PlayerNotebookEntry } from "@/types";

interface NotebookWithEvent extends PlayerNotebookEntry {
  event: {
    id: string;
    event_date: string | null;
    opponent: string | null;
    title: string | null;
  } | null;
}

interface CompletedMatch {
  event_id: string;
  event_date: string | null;
  opponent: string | null;
  title: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;
}

function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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
              n <= value ? "fill-[var(--color-gold)] text-[var(--color-gold)]" : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
      <span className="ml-1 text-xs font-semibold">{value}/10</span>
    </div>
  );
}

export function PlayerNotebookCard({
  playerId,
  teamId,
  canEdit,
}: {
  playerId: string;
  teamId: string;
  canEdit: boolean;
}) {
  const [entries, setEntries] = useState<NotebookWithEvent[]>([]);
  const [pendingMatches, setPendingMatches] = useState<CompletedMatch[]>([]);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [performance, setPerformance] = useState(5);
  const [notable, setNotable] = useState("");
  const [improvements, setImprovements] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [entriesRes, matchesRes] = await Promise.all([
        supabase
          .from("player_notebook_entries")
          .select("id, player_id, team_id, event_id, performance, notable_events, improvements, notes, created_at, event:events(id, event_date, opponent, title)")
          .eq("player_id", playerId)
          .eq("team_id", teamId)
          .order("created_at", { ascending: false }),
        supabase
          .from("match_stats")
          .select("event_id, event:events(id, event_date, opponent, title, status)")
          .eq("player_id", playerId)
          .eq("team_id", teamId),
      ]);

      const rows = (entriesRes.data || []) as unknown as NotebookWithEvent[];
      const allMatches = (matchesRes.data || []) as unknown as {
        event_id: string;
        event: { id: string; event_date: string | null; opponent: string | null; title: string | null; status: string } | null;
      }[];
      const completed = allMatches
        .filter((m) => m.event?.status === "completed")
        .map((m) => ({
          event_id: m.event_id,
          event_date: m.event?.event_date ?? null,
          opponent: m.event?.opponent ?? null,
          title: m.event?.title ?? null,
        }))
        .sort((a, b) => new Date(a.event_date ?? 0).getTime() - new Date(b.event_date ?? 0).getTime());

      if (!cancelled) {
        setEntries(rows);
        setPendingMatches(completed);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [playerId, teamId]);

  const editedIds = new Set(entries.map((e) => e.event_id));
  const missing = pendingMatches.filter((m) => !editedIds.has(m.event_id));

  function startEdit(match?: CompletedMatch) {
    if (!match) return;
    const existing = entries.find((e) => e.event_id === match.event_id);
    setEditingEventId(match.event_id);
    setPerformance(existing?.performance ?? 5);
    setNotable(existing?.notable_events ?? "");
    setImprovements(existing?.improvements ?? "");
    setNotes(existing?.notes ?? "");
  }

  async function handleSave() {
    if (!editingEventId) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        player_id: playerId,
        team_id: teamId,
        event_id: editingEventId,
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
      setEditingEventId(null);
      const { data } = await supabase
        .from("player_notebook_entries")
        .select("id, player_id, team_id, event_id, performance, notable_events, improvements, notes, created_at, event:events(id, event_date, opponent, title)")
        .eq("player_id", playerId)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false });
      setEntries((data || []) as unknown as NotebookWithEvent[]);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[var(--color-royal)]" />
          Carnet de match
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {canEdit && missing.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Matchs sans note — ajoute ton ressenti :
            </p>
            <div className="flex flex-wrap gap-2">
              {missing.map((m) => (
                <Button
                  key={m.event_id}
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(m)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {formatDate(m.event_date)} · {m.opponent || m.title || "Match"}
                </Button>
              ))}
            </div>
          </div>
        )}

        {editingEventId && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {pendingMatches.find((m) => m.event_id === editingEventId)?.opponent ||
                  entries.find((e) => e.event_id === editingEventId)?.event?.opponent ||
                  "Match"}
              </p>
              <div className="flex gap-1">
                <Button size="sm" className="h-7" onClick={handleSave} disabled={saving}>
                  {saving ? "..." : <><Check className="h-3.5 w-3.5 mr-1" /> Enregistrer</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingEventId(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ma prestation</Label>
              <StarRow value={performance} onChange={setPerformance} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nbNotable">Ce que j&apos;ai bien fait</Label>
              <Textarea
                id="nbNotable"
                value={notable}
                onChange={(e) => setNotable(e.target.value)}
                placeholder="Mes points forts du match..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nbImprove">Mes axes de progression</Label>
              <Textarea
                id="nbImprove"
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                placeholder="Ce que je veux améliorer..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nbNotes">Mes impressions</Label>
              <Input
                id="nbNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ressenti, contexte..."
              />
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {canEdit
              ? "Aucune entrée pour l'instant. Après un match, ajoute ton ressenti !"
              : "Aucune entrée pour l'instant."}
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {e.event?.opponent || e.event?.title || "Match"}
                  </p>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(e.event?.event_date ?? null)}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 mt-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <Star
                      key={n}
                      className={`h-3.5 w-3.5 ${
                        n <= e.performance
                          ? "fill-[var(--color-gold)] text-[var(--color-gold)]"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                  <span className="ml-1.5 text-xs font-semibold">{e.performance}/10</span>
                  {canEdit && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 ml-auto"
                      onClick={() =>
                        startEdit({
                          event_id: e.event_id,
                          event_date: e.event?.event_date ?? null,
                          opponent: e.event?.opponent ?? null,
                          title: e.event?.title ?? null,
                        })
                      }
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {e.notable_events && (
                  <p className="text-xs mt-2">
                    <span className="text-green-600 font-medium">Bien fait : </span>
                    {e.notable_events}
                  </p>
                )}
                {e.improvements && (
                  <p className="text-xs mt-0.5">
                    <span className="text-amber-600 font-medium">À améliorer : </span>
                    {e.improvements}
                  </p>
                )}
                {e.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{e.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
