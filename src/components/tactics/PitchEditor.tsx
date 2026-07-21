"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { useToast } from "@/hooks/use-toast";

interface PlayerPos {
  id: string;
  name: string;
  number: number;
  x: number;
  y: number;
}

interface FormationRecord {
  id: string;
  name: string;
  formation_data: { formation_type: string; positions: PlayerPos[] };
  event_id: string | null;
}

const FORMATION_TEMPLATES: Record<string, { name: string; positions: Omit<PlayerPos, "id" | "name" | "number">[] }> = {
  "4-3-3": {
    name: "4-3-3",
    positions: [
      { x: 50, y: 90 },
      { x: 15, y: 70 }, { x: 38, y: 73 }, { x: 62, y: 73 }, { x: 85, y: 70 },
      { x: 30, y: 50 }, { x: 50, y: 48 }, { x: 70, y: 50 },
      { x: 20, y: 28 }, { x: 50, y: 22 }, { x: 80, y: 28 },
    ],
  },
  "4-4-2": {
    name: "4-4-2",
    positions: [
      { x: 50, y: 90 },
      { x: 15, y: 70 }, { x: 38, y: 73 }, { x: 62, y: 73 }, { x: 85, y: 70 },
      { x: 15, y: 48 }, { x: 38, y: 50 }, { x: 62, y: 50 }, { x: 85, y: 48 },
      { x: 35, y: 25 }, { x: 65, y: 25 },
    ],
  },
  "3-5-2": {
    name: "3-5-2",
    positions: [
      { x: 50, y: 90 },
      { x: 25, y: 72 }, { x: 50, y: 75 }, { x: 75, y: 72 },
      { x: 10, y: 50 }, { x: 30, y: 48 }, { x: 50, y: 45 }, { x: 70, y: 48 }, { x: 90, y: 50 },
      { x: 35, y: 25 }, { x: 65, y: 25 },
    ],
  },
};

const FIELD_WIDTH = 400;
const FIELD_HEIGHT = 550;

export function PitchEditor() {
  const { toast } = useToast();
  const [players, setPlayers] = useState<PlayerPos[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [savedFormations, setSavedFormations] = useState<FormationRecord[]>([]);
  const [selectedFormationId, setSelectedFormationId] = useState<string>("new");
  const [formationName, setFormationName] = useState("");
  const [formationType, setFormationType] = useState("4-3-3");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/players").then((r) => r.json()),
      fetch("/api/formations").then((r) => r.json()),
    ]).then(([playersData, formationsData]) => {
      if (Array.isArray(playersData)) {
        const roster = playersData
          .filter((p: { is_active?: boolean }) => p.is_active !== false)
          .map((p: { id: string; first_name: string; last_name: string; shirt_number?: number }) => ({
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            number: p.shirt_number ?? 0,
            x: 50,
            y: 50,
          }));
        setPlayers(roster);
      }
      if (Array.isArray(formationsData)) {
        setSavedFormations(formationsData);
      }
      setLoading(false);
    });
  }, []);

  const applyTemplate = useCallback((key: string) => {
    setFormationType(key);
    const f = FORMATION_TEMPLATES[key];
    if (!f) return;
    setPlayers((prev) =>
      f.positions.map((pos, i) => ({
        ...(prev[i] || { id: `player-${i}`, name: `Joueur ${i + 1}`, number: i + 1 }),
        ...pos,
      }))
    );
  }, []);

  const loadSaved = useCallback((fId: string) => {
    setSelectedFormationId(fId);
    if (fId === "new") {
      setFormationName("");
      setFormationType("4-3-3");
      applyTemplate("4-3-3");
      return;
    }
    const found = savedFormations.find((f) => f.id === fId);
    if (found) {
      setFormationName(found.name);
      setFormationType(found.formation_data.formation_type);
      setPlayers(found.formation_data.positions);
    }
  }, [savedFormations, applyTemplate]);

  const handleSave = useCallback(async () => {
    if (!formationName.trim()) {
      toast({ title: "Erreur", description: "Donnez un nom à la formation", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formationName,
        formation_type: formationType,
        positions: players.map(({ x, y, id }) => ({ x, y, id })),
      };
      const isEdit = selectedFormationId && selectedFormationId !== "new";
      const url = isEdit ? `/api/formations/${selectedFormationId}` : "/api/formations";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({ title: "Sauvegardé", description: `"${formationName}" enregistrée` });
      if (!isEdit) setSelectedFormationId(data.id);
    } catch (e) {
      toast({ title: "Erreur", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [formationName, formationType, players, selectedFormationId, toast]);

  const handleDelete = useCallback(async () => {
    if (!selectedFormationId || selectedFormationId === "new") return;
    const res = await fetch(`/api/formations/${selectedFormationId}`, { method: "DELETE" });
    if (res.ok) {
      setSavedFormations((prev) => prev.filter((f) => f.id !== selectedFormationId));
      setSelectedFormationId("new");
      setFormationName("");
      setFormationType("4-3-3");
      applyTemplate("4-3-3");
      toast({ title: "Supprimée" });
    }
  }, [selectedFormationId, applyTemplate, toast]);

  const handleMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(id);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === dragging
            ? { ...p, x: Math.max(5, Math.min(95, x)), y: Math.max(5, Math.min(95, y)) }
            : p
        )
      );
    },
    [dragging]
  );

  const handleMouseUp = useCallback(() => setDragging(null), []);

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Éditeur de terrain</CardTitle>
          <div className="flex flex-col gap-3 mt-2">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">Sauvegardée</Label>
                <Select value={selectedFormationId} onValueChange={(v) => v && loadSaved(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Nouvelle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">+ Nouvelle formation</SelectItem>
                    {savedFormations.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name} ({f.formation_data.formation_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs">Nom</Label>
                <Input
                  placeholder="Ex: Match vs Valence"
                  value={formationName}
                  onChange={(e) => setFormationName(e.target.value)}
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <Label className="text-xs">Modèle</Label>
                <Select value={formationType} onValueChange={(v) => v && applyTemplate(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(FORMATION_TEMPLATES).map((key) => (
                      <SelectItem key={key} value={key}>
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "..." : "Sauvegarder"}
              </Button>
              {selectedFormationId && selectedFormationId !== "new" && (
                <Button size="sm" variant="destructive" onClick={handleDelete}>
                  Supprimer
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="relative mx-auto border-2 border-green-600 rounded-lg overflow-hidden cursor-crosshair"
            style={{
              width: FIELD_WIDTH,
              height: FIELD_HEIGHT,
              maxWidth: "100%",
              background: "repeating-linear-gradient(0deg, #1a7a3a, #1a7a3a 10px, #1d8a40 10px, #1d8a40 20px)",
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div className="absolute inset-0">
              <div className="absolute left-0 right-0 top-1/2 h-px bg-white/60" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/60" />
              <div className="absolute left-1/4 right-1/4 top-0 h-16 border border-white/60" />
              <div className="absolute left-1/4 right-1/4 bottom-0 h-16 border border-white/60" />
            </div>
            {players.map((player) => (
              <div
                key={player.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10"
                style={{ left: `${player.x}%`, top: `${player.y}%` }}
                onMouseDown={handleMouseDown(player.id)}
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] text-xs font-bold shadow-lg border-2 border-white">
                    {player.number || "?"}
                  </div>
                  <span className="text-[10px] text-white bg-black/50 rounded px-1 mt-0.5 whitespace-nowrap">
                    {player.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Glissez-déposez les joueurs pour ajuster leurs positions
          </p>
        </CardContent>
      </Card>
    </RoleGuard>
  );
}
