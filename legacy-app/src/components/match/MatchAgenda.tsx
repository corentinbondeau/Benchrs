"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListChecks, Loader2, Plus, Trash2 } from "lucide-react";
import type { MatchAgendaItem } from "@/types";

interface Props {
  eventId: string;
  teamId: string;
  isCoach: boolean;
}

export function MatchAgenda({ eventId, teamId, isCoach }: Props) {
  const [items, setItems] = useState<MatchAgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("");

  const load = useCallback(async (eventId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("match_agenda_items")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true });
    return (data as MatchAgendaItem[]) || [];
  }, []);

  useEffect(() => {
    load(eventId).then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, [eventId, load]);

  async function add() {
    if (!label.trim()) return;
    const supabase = createClient();
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), 0);
    const { data, error } = await supabase
      .from("match_agenda_items")
      .insert({
        event_id: eventId,
        team_id: teamId,
        label: label.trim(),
        agenda_time: time || null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => [...prev, data as MatchAgendaItem].sort((a, b) => a.sort_order - b.sort_order));
    setLabel("");
    setTime("");
  }

  async function remove(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("match_agenda_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function move(id: string, dir: -1 | 1) {
    const supabase = createClient();
    const idx = items.findIndex((i) => i.id === id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    const orders = next.map((i, k) => ({ id: i.id, sort_order: k }));
    setItems(next);
    for (const o of orders) {
      await supabase.from("match_agenda_items").update({ sort_order: o.sort_order }).eq("id", o.id);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[var(--color-royal)]" />
          Ordre du jour du match
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Aucun point au programme pour l&apos;instant.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((item, idx) => (
              <li key={item.id} className="flex items-center gap-2 rounded-lg border bg-background p-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-navy)] text-xs font-bold text-white">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.label}</p>
                  {item.agenda_time && (
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {item.agenda_time.slice(0, 5)}
                    </p>
                  )}
                </div>
                {isCoach && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button size="icon-sm" variant="ghost" onClick={() => move(item.id, -1)} disabled={idx === 0}>
                      ↑
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => move(item.id, 1)} disabled={idx === items.length - 1}>
                      ↓
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => remove(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {isCoach && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5">
            <p className="text-xs font-medium text-muted-foreground">Ajouter un point</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Ex : Causerie d'avant-match"
              />
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="sm:w-32" />
              <Button size="sm" onClick={add} disabled={!label.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Ajouter
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
