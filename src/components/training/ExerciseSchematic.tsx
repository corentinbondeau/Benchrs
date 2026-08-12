"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowRight,
  Circle,
  Eraser,
  MousePointer2,
  Shirt,
  Square,
  TrafficCone,
  Trash2,
  Type,
} from "lucide-react";
import type { ExerciseSchematic, ExerciseSchematicElement } from "@/types";

type Tool = "select" | "player" | "cone" | "ball" | "arrow" | "zone" | "label";

const VB_W = 300;
const VB_H = 450;

const TEAM_COLORS: Record<NonNullable<ExerciseSchematicElement["team"]>, string> = {
  att: "#C0392B",
  def: "#2E86DE",
  neutral: "#FFFFFF",
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function SchematicPitch({
  svgRef,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  svgRef?: React.RefObject<SVGSVGElement | null>;
  children?: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
}) {
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="h-full w-full touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <rect x="0" y="0" width="300" height="450" fill="#1B7A3D" />
      <g stroke="rgba(255,255,255,0.55)" fill="none" strokeWidth={2}>
        <rect x="8" y="8" width="284" height="434" rx="2" />
        <line x1="8" y1="225" x2="292" y2="225" strokeWidth={1.5} />
        <circle cx="150" cy="225" r="50" strokeWidth={1.5} />
        <circle cx="150" cy="225" r="3" fill="rgba(255,255,255,0.7)" />
        <rect x="75" y="8" width="150" height="80" strokeWidth={1.5} />
        <rect x="105" y="8" width="90" height="35" strokeWidth={1.5} />
        <circle cx="150" cy="55" r="3" fill="rgba(255,255,255,0.7)" />
        <path d="M 115 88 Q 150 72 185 88" strokeWidth={1.5} />
        <rect x="120" y="0" width="60" height="8" strokeWidth={2} />
        <rect x="75" y="362" width="150" height="80" strokeWidth={1.5} />
        <rect x="105" y="407" width="90" height="35" strokeWidth={1.5} />
        <circle cx="150" cy="395" r="3" fill="rgba(255,255,255,0.7)" />
        <path d="M 115 362 Q 150 378 185 362" strokeWidth={1.5} />
        <rect x="120" y="442" width="60" height="8" strokeWidth={2} />
      </g>
      {children}
    </svg>
  );
}

function RenderElement({
  el,
  selected,
}: {
  el: ExerciseSchematicElement;
  selected: boolean;
}) {
  if (el.type === "player") {
    const color = TEAM_COLORS[el.team || "att"];
    const dark = el.team === "neutral";
    return (
      <g>
        <circle cx={el.x} cy={el.y} r={10} fill={color} stroke="#FFFFFF" strokeWidth={1.5} />
        <text
          x={el.x}
          y={el.y + 3.5}
          textAnchor="middle"
          fontSize={9}
          fontWeight="bold"
          fill={dark ? "#1F2937" : "#FFFFFF"}
        >
          {el.number || ""}
        </text>
        {selected && (
          <circle cx={el.x} cy={el.y} r={14} fill="none" stroke="#F6C453" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </g>
    );
  }
  if (el.type === "cone") {
    return (
      <g>
        <polygon
          points={`${el.x},${el.y - 9} ${el.x - 6},${el.y + 7} ${el.x + 6},${el.y + 7}`}
          fill="#F97316"
          stroke="#FFFFFF"
          strokeWidth={1}
        />
        {selected && (
          <circle cx={el.x} cy={el.y} r={13} fill="none" stroke="#F6C453" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </g>
    );
  }
  if (el.type === "ball") {
    return (
      <g>
        <circle cx={el.x} cy={el.y} r={4.5} fill="#FFFFFF" stroke="#111111" strokeWidth={1} />
        {selected && (
          <circle cx={el.x} cy={el.y} r={9} fill="none" stroke="#F6C453" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </g>
    );
  }
  if (el.type === "arrow") {
    const x1 = el.x;
    const y1 = el.y;
    const x2 = el.x2 ?? el.x;
    const y2 = el.y2 ?? el.y;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = 9;
    const hx = x2 - len * Math.cos(angle);
    const hy = y2 - len * Math.sin(angle);
    const dx1 = hx + len * 0.5 * Math.sin(angle);
    const dy1 = hy - len * 0.5 * Math.cos(angle);
    const dx2 = hx - len * 0.5 * Math.sin(angle);
    const dy2 = hy + len * 0.5 * Math.cos(angle);
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#F6C453" strokeWidth={2.5} />
        <polygon points={`${x2},${y2} ${dx1},${dy1} ${dx2},${dy2}`} fill="#F6C453" />
        {selected && (
          <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={7} fill="none" stroke="#F6C453" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </g>
    );
  }
  if (el.type === "zone") {
    const x = Math.min(el.x, el.x2 ?? el.x);
    const y = Math.min(el.y, el.y2 ?? el.y);
    const w = Math.abs((el.x2 ?? el.x) - el.x);
    const h = Math.abs((el.y2 ?? el.y) - el.y);
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.18)" stroke="#F6C453" strokeWidth={1.5} />
        {el.text ? (
          <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={9} fill="#FFFFFF">
            {el.text}
          </text>
        ) : null}
        {selected && (
          <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="none" stroke="#FFFFFF" strokeWidth={1.5} strokeDasharray="4 3" />
        )}
      </g>
    );
  }
  return (
    <text
      x={el.x}
      y={el.y + 4}
      textAnchor="middle"
      fontSize={11}
      fontWeight="bold"
      fill="#FFFFFF"
      stroke="rgba(0,0,0,0.35)"
      strokeWidth={0.4}
    >
      {el.text || "Texte"}
    </text>
  );
}

function hitTest(x: number, y: number, elements: ExerciseSchematicElement[]) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === "player" || el.type === "ball") {
      const r = el.type === "ball" ? 9 : 13;
      if (Math.hypot(el.x - x, el.y - y) <= r) return el;
    } else if (el.type === "cone") {
      if (x >= el.x - 9 && x <= el.x + 9 && y >= el.y - 11 && y <= el.y + 9) return el;
    } else if (el.type === "arrow") {
      if (distToSegment(x, y, el.x, el.y, el.x2 ?? el.x, el.y2 ?? el.y) <= 7) return el;
    } else if (el.type === "zone") {
      const x1 = Math.min(el.x, el.x2 ?? el.x);
      const x2 = Math.max(el.x, el.x2 ?? el.x);
      const y1 = Math.min(el.y, el.y2 ?? el.y);
      const y2 = Math.max(el.y, el.y2 ?? el.y);
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return el;
    } else if (Math.abs(x - el.x) <= 42 && Math.abs(y - el.y) <= 12) {
      return el;
    }
  }
  return null;
}

const TOOLS: { id: Tool; label: string; icon: typeof Shirt }[] = [
  { id: "select", label: "Sélectionner / déplacer", icon: MousePointer2 },
  { id: "player", label: "Joueur", icon: Shirt },
  { id: "cone", label: "Cône", icon: TrafficCone },
  { id: "ball", label: "Ballon", icon: Circle },
  { id: "arrow", label: "Flèche (déplacement)", icon: ArrowRight },
  { id: "zone", label: "Zone", icon: Square },
  { id: "label", label: "Texte", icon: Type },
];

export function ExerciseSchematicView({
  schema,
}: {
  schema: ExerciseSchematic | null | undefined;
}) {
  if (!schema || !schema.elements || schema.elements.length === 0) return null;
  return (
    <div className="mx-auto my-2 w-full max-w-[240px] aspect-[2/3] overflow-hidden rounded-lg bg-[#1B7A3D]">
      <SchematicPitch>
        {schema.elements.map((el) => (
          <RenderElement key={el.id} el={el} selected={false} />
        ))}
      </SchematicPitch>
    </div>
  );
}

export function ExerciseSchematicEditor({
  value,
  onChange,
}: {
  value: ExerciseSchematic;
  onChange: (s: ExerciseSchematic) => void;
}) {
  const elements = value.elements;
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const [zoneDraft, setZoneDraft] = useState<{
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [hoverPt, setHoverPt] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  function updateElement(id: string, patch: Partial<ExerciseSchematicElement>) {
    onChange({
      elements: elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  }

  function addElement(el: ExerciseSchematicElement) {
    onChange({ elements: [...elements, el] });
  }

  function removeElement(id: string) {
    onChange({ elements: elements.filter((el) => el.id !== id) });
  }

  function toSvgPoint(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * VB_W,
      y: ((e.clientY - rect.top) / rect.height) * VB_H,
    };
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const pt = toSvgPoint(e);
    if (tool === "select") {
      const hit = hitTest(pt.x, pt.y, elements);
      if (hit) {
        setSelectedId(hit.id);
        dragRef.current = { id: hit.id, offsetX: hit.x - pt.x, offsetY: hit.y - pt.y };
        svgRef.current?.setPointerCapture(e.pointerId);
      } else {
        setSelectedId(null);
      }
    } else if (tool === "player") {
      const id = crypto.randomUUID();
      const count = elements.filter((el) => el.type === "player").length + 1;
      addElement({ id, type: "player", x: pt.x, y: pt.y, team: "att", number: String(count) });
      setSelectedId(id);
    } else if (tool === "cone") {
      const id = crypto.randomUUID();
      addElement({ id, type: "cone", x: pt.x, y: pt.y });
      setSelectedId(id);
    } else if (tool === "ball") {
      const id = crypto.randomUUID();
      addElement({ id, type: "ball", x: pt.x, y: pt.y });
      setSelectedId(id);
    } else if (tool === "label") {
      const id = crypto.randomUUID();
      addElement({ id, type: "label", x: pt.x, y: pt.y, text: "Texte" });
      setSelectedId(id);
    } else if (tool === "arrow") {
      if (!arrowStart) {
        setArrowStart({ x: pt.x, y: pt.y });
      } else {
        addElement({ id: crypto.randomUUID(), type: "arrow", x: arrowStart.x, y: arrowStart.y, x2: pt.x, y2: pt.y });
        setArrowStart(null);
        setTool("select");
      }
    } else if (tool === "zone") {
      const id = crypto.randomUUID();
      setZoneDraft({ id, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const pt = toSvgPoint(e);
    setHoverPt(pt);
    if (tool === "select" && dragRef.current) {
      const { id, offsetX, offsetY } = dragRef.current;
      updateElement(id, {
        x: clamp(pt.x + offsetX, 10, VB_W - 10),
        y: clamp(pt.y + offsetY, 10, VB_H - 10),
      });
    } else if (tool === "zone" && zoneDraft) {
      setZoneDraft((prev) =>
        prev
          ? {
              ...prev,
              x2: clamp(pt.x, 5, VB_W - 5),
              y2: clamp(pt.y, 5, VB_H - 5),
            }
          : prev
      );
    }
  }

  function handlePointerUp() {
    if (tool === "select") {
      dragRef.current = null;
    } else if (tool === "zone" && zoneDraft) {
      const z = zoneDraft;
      setZoneDraft(null);
      if (Math.abs(z.x2 - z.x1) > 5 && Math.abs(z.y2 - z.y1) > 5) {
        addElement({ id: z.id, type: "zone", x: z.x1, y: z.y1, x2: z.x2, y2: z.y2 });
        setSelectedId(z.id);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selectedId && tool === "select") {
      e.preventDefault();
      removeElement(selectedId);
      setSelectedId(null);
    }
    if (e.key === "Escape") {
      setSelectedId(null);
      setArrowStart(null);
      setZoneDraft(null);
    }
  }

  const selected = selectedId ? elements.find((el) => el.id === selectedId) || null : null;

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="flex flex-wrap items-center gap-1.5">
        {TOOLS.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tool === t.id ? "default" : "outline"}
            className={
              tool === t.id
                ? "bg-[var(--color-royal)] text-white border-[var(--color-royal)]"
                : "text-muted-foreground"
            }
            title={t.label}
            aria-label={t.label}
            onClick={() => {
              setTool(t.id);
              if (t.id !== "arrow") setArrowStart(null);
            }}
          >
            <t.icon className="h-4 w-4" />
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto text-destructive"
          title="Tout effacer"
          aria-label="Tout effacer"
          onClick={() => {
            onChange({ elements: [] });
            setSelectedId(null);
            setArrowStart(null);
            setZoneDraft(null);
          }}
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-col items-start gap-3 sm:flex-row">
        <div className="w-full flex-1">
          <div className="mx-auto w-full max-w-[300px] aspect-[2/3] overflow-hidden rounded-xl bg-[#1B7A3D] shadow-lg">
            <SchematicPitch
              svgRef={svgRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {elements.map((el) => (
                <RenderElement key={el.id} el={el} selected={el.id === selectedId} />
              ))}
              {arrowStart && hoverPt && (
                <line x1={arrowStart.x} y1={arrowStart.y} x2={hoverPt.x} y2={hoverPt.y} stroke="#F6C453" strokeWidth={2.5} strokeDasharray="5 4" />
              )}
              {zoneDraft && (
                <rect
                  x={Math.min(zoneDraft.x1, zoneDraft.x2)}
                  y={Math.min(zoneDraft.y1, zoneDraft.y2)}
                  width={Math.abs(zoneDraft.x2 - zoneDraft.x1)}
                  height={Math.abs(zoneDraft.y2 - zoneDraft.y1)}
                  fill="rgba(255,255,255,0.18)"
                  stroke="#F6C453"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              )}
            </SchematicPitch>
          </div>
        </div>

        <div className="w-full sm:w-56 space-y-2">
          {selected ? (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Élément</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => {
                    removeElement(selected.id);
                    setSelectedId(null);
                  }}
                  aria-label="Supprimer l'élément"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {selected.type === "player" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Équipe</Label>
                    <select
                      value={selected.team || "att"}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          team: e.target.value as ExerciseSchematicElement["team"],
                        })
                      }
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="att">Attaque (rouge)</option>
                      <option value="def">Défense (bleu)</option>
                      <option value="neutral">Neutre (blanc)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Numéro / Nom</Label>
                    <Input
                      value={selected.number || ""}
                      onChange={(e) => updateElement(selected.id, { number: e.target.value })}
                      placeholder="Ex : 10"
                      className="h-8"
                    />
                  </div>
                </>
              )}
              {selected.type === "label" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Texte</Label>
                  <Input
                    value={selected.text || ""}
                    onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                    className="h-8"
                  />
                </div>
              )}
              {selected.type === "zone" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Libellé (optionnel)</Label>
                  <Input
                    value={selected.text || ""}
                    onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                    placeholder="Ex : Zone A"
                    className="h-8"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              {tool === "select"
                ? "Clique sur un élément puis glisse pour le déplacer."
                : `Clique sur le terrain pour ajouter un élément (${TOOLS.find((t) => t.id === tool)?.label.toLowerCase()}).`}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Joueurs, cônes, ballons, zones et flèches de déplacement. Un schéma clair aide tes joueurs à s&apos;installer plus vite.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ExerciseSchematicDialog({
  open,
  onOpenChange,
  value,
  onChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: ExerciseSchematic;
  onChange: (s: ExerciseSchematic) => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schéma de l&apos;exercice</DialogTitle>
        </DialogHeader>
        <ExerciseSchematicEditor value={value} onChange={onChange} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={onSave}
            className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
          >
            Enregistrer le schéma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
