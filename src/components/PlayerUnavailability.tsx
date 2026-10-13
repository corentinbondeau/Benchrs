"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, CalendarOff } from "lucide-react";
import { toast } from "sonner";

interface Unavailability {
  id: string;
  player_id: string;
  team_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_at: string;
}

export function PlayerUnavailability({ playerId }: { playerId?: string } = {}) {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const [items, setItems] = useState<Unavailability[]>([]);
  const [saving, setSaving] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  // Un joueur gère SES indisponibilités ; un parent gère celles de l'enfant
  // passé en prop (`playerId`).
  const myPlayerId = playerId ?? (userRole === "player" ? user?.id : null);

  const fetchItems = useCallback(async (): Promise<Unavailability[]> => {
    if (!currentTeam || !myPlayerId) return [];
    const supabase = createClient();
    const { data } = await supabase
      .from("player_unavailability")
      .select("*")
      .eq("team_id", currentTeam.id)
      .eq("player_id", myPlayerId)
      .order("start_date", { ascending: true });
    return (data as Unavailability[]) || [];
  }, [currentTeam, myPlayerId]);

  useEffect(() => {
    let active = true;
    fetchItems().then((res) => {
      if (active) setItems(res);
    });
    return () => {
      active = false;
    };
  }, [fetchItems]);

  async function refresh() {
    setItems(await fetchItems());
  }

  async function add() {
    if (!currentTeam || !myPlayerId || !startDate || !endDate) return;
    if (new Date(endDate) < new Date(startDate)) {
      toast.error("La date de fin doit être >= à la date de début");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("player_unavailability").insert({
      team_id: currentTeam.id,
      player_id: myPlayerId,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
      created_by: user?.id,
    });
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de l'ajout");
      return;
    }
    setStartDate("");
    setEndDate("");
    setReason("");
    await refresh();
    toast.success("Période d'indisponibilité ajoutée");
  }

  async function remove(id: string) {
    const supabase = createClient();
    await supabase.from("player_unavailability").delete().eq("id", id);
    await refresh();
  }

  if (!myPlayerId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CalendarOff className="h-4 w-4" />
          Indisponibilités
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Début</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fin</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <Label className="text-xs">Motif</Label>
            <Input placeholder="Optionnel" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9" />
          </div>
        </div>
        <Button onClick={add} disabled={saving || !startDate || !endDate} size="sm" className="w-full sm:w-auto">
          <Plus className="mr-1 h-4 w-4" />
          Ajouter une période
        </Button>
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">
                    {new Date(it.start_date).toLocaleDateString("fr-FR")} → {new Date(it.end_date).toLocaleDateString("fr-FR")}
                  </span>
                  {it.reason && <p className="text-xs text-muted-foreground">{it.reason}</p>}
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove(it.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
