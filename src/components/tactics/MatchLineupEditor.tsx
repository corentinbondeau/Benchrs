"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Save, RotateCcw, Shirt } from "lucide-react";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

interface PlayerProfile {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
  position: string | null;
}

interface MatchEvent {
  id: string;
  title: string;
  event_date: string;
  opponent: string | null;
  status: string;
}

interface LineupSlot {
  player_id: string | null;
  position_label: string;
  x: number;
  y: number;
}

interface SubSlot {
  player_id: string | null;
  label: string;
}

const STARTER_POSITIONS: { label: string; x: number; y: number }[] = [
  { label: "Gardien", x: 50, y: 92 },
  { label: "Défenseur gauche", x: 15, y: 73 },
  { label: "Défenseur", x: 38, y: 76 },
  { label: "Défenseur", x: 62, y: 76 },
  { label: "Défenseur droit", x: 85, y: 73 },
  { label: "Milieu gauche", x: 25, y: 52 },
  { label: "Milieu", x: 43, y: 50 },
  { label: "Milieu", x: 57, y: 50 },
  { label: "Milieu droit", x: 75, y: 52 },
  { label: "Attaquant", x: 35, y: 28 },
  { label: "Attaquant", x: 65, y: 28 },
];

const SUB_POSITIONS: { label: string }[] = [
  { label: "Remplaçant 1" },
  { label: "Remplaçant 2" },
  { label: "Remplaçant 3" },
];

const FIELD_WIDTH = 400;
const FIELD_HEIGHT = 550;

function PlayerChip({ player, number }: { player: PlayerProfile; number?: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] text-xs font-bold shadow-lg border-2 border-white">
        {player.shirt_number || number || "?"}
      </div>
      <span className="text-[10px] text-white bg-black/50 rounded px-1 mt-0.5 whitespace-nowrap max-w-[80px] truncate">
        {player.first_name} {player.last_name}
      </span>
    </div>
  );
}

function DraggablePlayer({ player }: { player: PlayerProfile }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `roster-${player.id}`,
    data: { player, source: "roster" as const },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded-lg border p-2 cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? "opacity-40" : "opacity-100"
      } hover:bg-muted/50`}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-[10px] font-bold shrink-0">
        {player.shirt_number || "?"}
      </div>
      <span className="text-xs font-medium truncate">
        {player.first_name} {player.last_name}
      </span>
      {player.position && (
        <Badge variant="outline" className="text-[10px] ml-auto shrink-0">
          {player.position}
        </Badge>
      )}
    </div>
  );
}

function DroppableFieldSlot({
  slot,
  player,
  index,
  onRemove,
}: {
  slot: LineupSlot;
  player: PlayerProfile | null;
  index: number;
  onRemove: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `starter-${index}`,
    data: { type: "starter" as const, index },
  });

  return (
    <div
      ref={setNodeRef}
      className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
    >
      {player ? (
        <div className="relative group cursor-grab active:cursor-grabbing">
          <PlayerChip player={player} />
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ) : (
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed text-[10px] font-medium transition-colors ${
            isOver
              ? "border-[var(--gold)] bg-[var(--gold)]/20 text-[var(--gold)]"
              : "border-white/40 text-white/60"
          }`}
        >
          {index + 1}
        </div>
      )}
    </div>
  );
}

function DroppableSubSlot({
  slot,
  player,
  index,
  onRemove,
}: {
  slot: SubSlot;
  player: PlayerProfile | null;
  index: number;
  onRemove: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `sub-${index}`,
    data: { type: "sub" as const, index },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-3 rounded-lg border-2 border-dashed p-3 transition-colors min-h-[52px] ${
        isOver
          ? "border-[var(--gold)] bg-[var(--gold)]/10"
          : player
            ? "border-[var(--royal)]/30 bg-[var(--royal)]/5"
            : "border-muted-foreground/20"
      }`}
    >
      <span className="text-xs text-muted-foreground w-24 shrink-0">{slot.label}</span>
      {player ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-[10px] font-bold shrink-0">
            {player.shirt_number || "?"}
          </div>
          <span className="text-xs font-medium truncate">
            {player.first_name} {player.last_name}
          </span>
          <button
            onClick={onRemove}
            className="ml-auto h-5 w-5 rounded-full bg-red-500/10 text-red-500 text-[10px] flex items-center justify-center hover:bg-red-500/20 shrink-0"
          >
            ✕
          </button>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground italic">Glisser un joueur ici</span>
      )}
    </div>
  );
}

export function MatchLineupEditor() {
  const { toast } = useToast();
  const supabase = createClient();

  const [matches, setMatches] = useState<MatchEvent[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [players, setPlayers] = useState<PlayerProfile[]>([]);
  const [starters, setStarters] = useState<LineupSlot[]>(
    STARTER_POSITIONS.map((pos) => ({
      player_id: null,
      position_label: pos.label,
      x: pos.x,
      y: pos.y,
    }))
  );
  const [subs, setSubs] = useState<SubSlot[]>(
    SUB_POSITIONS.map((s) => ({
      player_id: null,
      label: s.label,
    }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  useEffect(() => {
    async function load() {
      const [matchesRes, playersRes] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, event_date, opponent, status")
          .eq("type", "match")
          .order("event_date", { ascending: false }),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, shirt_number, position")
          .eq("role", "player")
          .eq("is_active", true)
          .order("shirt_number"),
      ]);
      setMatches((matchesRes.data as MatchEvent[]) || []);
      setPlayers((playersRes.data as PlayerProfile[]) || []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  useEffect(() => {
    if (!selectedMatchId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("match_lineups")
        .select("player_id, position_label, is_starter")
        .eq("event_id", selectedMatchId);

      if (cancelled || !data) return;

      const newStarters = STARTER_POSITIONS.map((pos) => {
        const found = data.find((l) => l.position_label === pos.label && l.is_starter);
        return {
          player_id: found?.player_id || null,
          position_label: pos.label,
          x: pos.x,
          y: pos.y,
        };
      });

      const subData = data.filter((l) => !l.is_starter);
      const newSubs = SUB_POSITIONS.map((s, i) => ({
        player_id: subData[i]?.player_id || null,
        label: s.label,
      }));

      setStarters(newStarters);
      setSubs(newSubs);
    })();
    return () => { cancelled = true; };
  }, [selectedMatchId, supabase]);

  const usedPlayerIds = new Set([
    ...starters.filter((s) => s.player_id).map((s) => s.player_id!),
    ...subs.filter((s) => s.player_id).map((s) => s.player_id!),
  ]);

  const availablePlayers = players.filter((p) => !usedPlayerIds.has(p.id));

  const getPlayer = useCallback(
    (id: string | null) => (id ? players.find((p) => p.id === id) || null : null),
    [players]
  );

  const activePlayer = activeId
    ? (() => {
        if (activeId.startsWith("roster-")) {
          const pid = activeId.replace("roster-", "");
          return players.find((p) => p.id === pid) || null;
        }
        if (activeId.startsWith("starter-")) {
          const idx = parseInt(activeId.replace("starter-", ""));
          return getPlayer(starters[idx]?.player_id);
        }
        if (activeId.startsWith("sub-")) {
          const idx = parseInt(activeId.replace("sub-", ""));
          return getPlayer(subs[idx]?.player_id);
        }
        return null;
      })()
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    const activeData = active.data.current as { player?: PlayerProfile; source?: string } | undefined;
    const playerId = activeData?.player?.id;
    if (!playerId) return;

    const existingStarterIdx = starters.findIndex((s) => s.player_id === playerId);
    const existingSubIdx = subs.findIndex((s) => s.player_id === playerId);

    if (overId.startsWith("starter-")) {
      const targetIdx = parseInt(overId.replace("starter-", ""));
      const targetPlayer = starters[targetIdx].player_id;

      setStarters((prev) =>
        prev.map((s, i) => {
          if (i === targetIdx) return { ...s, player_id: playerId };
          if (s.player_id === playerId) return { ...s, player_id: targetPlayer };
          return s;
        })
      );

      if (existingSubIdx >= 0) {
        setSubs((prev) =>
          prev.map((s, i) => (i === existingSubIdx ? { ...s, player_id: targetPlayer } : s))
        );
      }
    } else if (overId.startsWith("sub-")) {
      const targetIdx = parseInt(overId.replace("sub-", ""));
      const targetPlayer = subs[targetIdx].player_id;

      setSubs((prev) =>
        prev.map((s, i) => {
          if (i === targetIdx) return { ...s, player_id: playerId };
          if (s.player_id === playerId) return { ...s, player_id: targetPlayer };
          return s;
        })
      );

      if (existingStarterIdx >= 0) {
        setStarters((prev) =>
          prev.map((s, i) => (i === existingStarterIdx ? { ...s, player_id: targetPlayer } : s))
        );
      }
    }
  }

  function removeStarter(index: number) {
    setStarters((prev) =>
      prev.map((s, i) => (i === index ? { ...s, player_id: null } : s))
    );
  }

  function removeSub(index: number) {
    setSubs((prev) =>
      prev.map((s, i) => (i === index ? { ...s, player_id: null } : s))
    );
  }

  function resetAll() {
    setStarters(STARTER_POSITIONS.map((pos) => ({
      player_id: null,
      position_label: pos.label,
      x: pos.x,
      y: pos.y,
    })));
    setSubs(SUB_POSITIONS.map((s) => ({
      player_id: null,
      label: s.label,
    })));
  }

  async function handleSave() {
    if (!selectedMatchId) {
      toast({ title: "Erreur", description: "Sélectionnez un match", variant: "destructive" });
      return;
    }

    const lineups = [
      ...starters.filter((s) => s.player_id).map((s) => ({
        player_id: s.player_id!,
        position_label: s.position_label,
        is_starter: true,
      })),
      ...subs.filter((s) => s.player_id).map((s) => ({
        player_id: s.player_id!,
        position_label: s.label,
        is_starter: false,
      })),
    ];

    setSaving(true);
    try {
      const res = await fetch("/api/match-lineups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: selectedMatchId, lineups }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      toast({ title: "Composition sauvegardée" });
    } catch (e) {
      toast({ title: "Erreur", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shirt className="h-4 w-4 text-[var(--gold)]" />
                Composition de match
              </CardTitle>
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs">Match</Label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={selectedMatchId}
                      onChange={(e) => setSelectedMatchId(e.target.value)}
                    >
                      <option value="">-- Choisir un match --</option>
                      {matches.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title} {m.opponent ? `vs ${m.opponent}` : ""} — {new Date(m.event_date).toLocaleDateString("fr-FR")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button size="sm" variant="outline" onClick={resetAll}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Réinitialiser
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[var(--gold)] text-[var(--gold-foreground)]">
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {saving ? "..." : "Sauvegarder"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {selectedMatchId ? (
                <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
                  {/* Roster list */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">
                      Effectif disponible
                      <Badge variant="outline" className="ml-2 text-xs">{availablePlayers.length}</Badge>
                    </h4>
                    <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                      {availablePlayers.map((player) => (
                        <DraggablePlayer key={player.id} player={player} />
                      ))}
                      {availablePlayers.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          Tous les joueurs sont placés
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Pitch + subs */}
                  <div className="space-y-4">
                    {/* Pitch */}
                    <div
                      className="relative mx-auto border-2 border-green-600 rounded-lg overflow-hidden"
                      style={{
                        width: FIELD_WIDTH,
                        height: FIELD_HEIGHT,
                        maxWidth: "100%",
                        background: "repeating-linear-gradient(0deg, #1a7a3a, #1a7a3a 10px, #1d8a40 10px, #1d8a40 20px)",
                      }}
                    >
                      {/* Field markings */}
                      <div className="absolute inset-0">
                        <div className="absolute left-0 right-0 top-1/2 h-px bg-white/60" />
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/60" />
                        <div className="absolute left-1/4 right-1/4 top-0 h-16 border border-white/60" />
                        <div className="absolute left-1/4 right-1/4 bottom-0 h-16 border border-white/60" />
                        <div className="absolute left-1/3 right-1/3 top-0 h-8 border border-white/60" />
                        <div className="absolute left-1/3 right-1/3 bottom-0 h-8 border border-white/60" />
                        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-4 h-4 border border-white/60 rounded-b-full" />
                        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-4 h-4 border border-white/60 rounded-t-full" />
                      </div>

                      {/* Starter slots */}
                      {starters.map((slot, i) => (
                        <DroppableFieldSlot
                          key={i}
                          slot={slot}
                          player={getPlayer(slot.player_id)}
                          index={i}
                          onRemove={() => removeStarter(i)}
                        />
                      ))}
                    </div>

                    {/* Substitutes */}
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Remplaçants</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {subs.map((slot, i) => (
                          <DroppableSubSlot
                            key={i}
                            slot={slot}
                            player={getPlayer(slot.player_id)}
                            index={i}
                            onRemove={() => removeSub(i)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                  <p className="text-sm">Sélectionnez un match pour composer l&apos;équipe</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DragOverlay>
          {activePlayer ? (
            <div className="opacity-90">
              <PlayerChip player={activePlayer} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </RoleGuard>
  );
}
