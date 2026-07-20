"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleGuard } from "@/components/layout/RoleGuard";

interface PlayerPos {
  id: string;
  name: string;
  number: number;
  x: number;
  y: number;
}

const formations: Record<string, { name: string; positions: Omit<PlayerPos, "id" | "name" | "number">[] }> = {
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
  const [formation, setFormation] = useState("4-3-3");
  const [players, setPlayers] = useState<PlayerPos[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);

  const applyFormation = useCallback((key: string) => {
    setFormation(key);
    const f = formations[key];
    if (!f) return;
    setPlayers(
      f.positions.map((pos, i) => ({
        id: `player-${i}`,
        name: `Joueur ${i + 1}`,
        number: i + 1,
        ...pos,
      }))
    );
  }, []);

  const handleMouseDown = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(id);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(
        ((e.clientX - rect.left) / rect.width) * 100
      );
      const y = Math.round(
        ((e.clientY - rect.top) / rect.height) * 100
      );
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

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <RoleGuard allowedRoles={["coach"]}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Éditeur de terrain</CardTitle>
          <div className="flex gap-3 mt-2">
            <Select value={formation} onValueChange={(v) => v && applyFormation(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(formations).map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyFormation(formation)}
            >
              Réinitialiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="relative mx-auto border-2 border-green-600 rounded-lg overflow-hidden cursor-crosshair"
            style={{
              width: FIELD_WIDTH,
              height: FIELD_HEIGHT,
              maxWidth: "100%",
              background:
                "repeating-linear-gradient(0deg, #1a7a3a, #1a7a3a 10px, #1d8a40 10px, #1d8a40 20px)",
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Field markings */}
            <div className="absolute inset-0">
              {/* Center line */}
              <div className="absolute left-0 right-0 top-1/2 h-px bg-white/60" />
              {/* Center circle */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/60" />
              {/* Penalty areas */}
              <div className="absolute left-1/4 right-1/4 top-0 h-16 border border-white/60" />
              <div className="absolute left-1/4 right-1/4 bottom-0 h-16 border border-white/60" />
            </div>

            {/* Players */}
            {players.map((player) => (
              <div
                key={player.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing z-10"
                style={{
                  left: `${player.x}%`,
                  top: `${player.y}%`,
                }}
                onMouseDown={handleMouseDown(player.id)}
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] text-xs font-bold shadow-lg border-2 border-white">
                    {player.number}
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
