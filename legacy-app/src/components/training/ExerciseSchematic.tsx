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
  Shapes,
  Shirt,
  Square,
  TrafficCone,
  Trash2,
  Type,
} from "lucide-react";
import type {
  ArrowVariant,
  ExerciseSchematic,
  ExerciseSchematicElement,
  SchematicView,
  ShapeKind,
  TeamColor,
} from "@/types";

type Tool = "select" | "player" | "cone" | "ball" | "arrow" | "zone" | "shape" | "label";

export const SCHEMATIC_VIEWS: Record<SchematicView, { w: number; h: number; aspect: string; label: string }> = {
  full: { w: 300, h: 450, aspect: "2 / 3", label: "Terrain entier" },
  half: { w: 300, h: 450, aspect: "2 / 3", label: "Demi-terrain" },
  third: { w: 300, h: 450, aspect: "2 / 3", label: "Surface de réparation" },
  h_full: { w: 450, h: 300, aspect: "3 / 2", label: "Terrain entier (horizontal)" },
  h_half: { w: 450, h: 300, aspect: "3 / 2", label: "Demi-terrain (horizontal)" },
};

export const TEAM_COLORS: Record<TeamColor, string> = {
  att: "#C0392B",
  def: "#2E86DE",
  neutral: "#FFFFFF",
  yellow: "#F4D03F",
  green: "#27AE60",
  orange: "#E67E22",
  purple: "#8E44AD",
  black: "#2C3E50",
};

export const TEAM_LABELS: Record<TeamColor, string> = {
  att: "Attaque (rouge)",
  def: "Défense (bleu)",
  neutral: "Neutre (blanc)",
  yellow: "Jaune",
  green: "Vert",
  orange: "Orange",
  purple: "Violet",
  black: "Noir",
};

export const CONE_COLORS: { label: string; value: string }[] = [
  { label: "Orange", value: "#F97316" },
  { label: "Rouge", value: "#C0392B" },
  { label: "Bleu", value: "#2E86DE" },
  { label: "Jaune", value: "#F4D03F" },
  { label: "Vert", value: "#27AE60" },
  { label: "Blanc", value: "#FFFFFF" },
];

export const SHAPE_KINDS: { label: string; value: ShapeKind }[] = [
  { label: "Rectangle", value: "rect" },
  { label: "Cercle", value: "circle" },
  { label: "Triangle", value: "triangle" },
  { label: "Losange", value: "diamond" },
  { label: "Hexagone", value: "hexagon" },
];

export const ARROW_VARIANTS: { label: string; value: ArrowVariant }[] = [
  { label: "Pleine", value: "solid" },
  { label: "Tiretée", value: "dashed" },
  { label: "Double sens", value: "double" },
  { label: "Courbée", value: "curved" },
];

const LIGHT_TEAMS: TeamColor[] = ["neutral", "yellow", "orange"];

function textOn(team: TeamColor) {
  return LIGHT_TEAMS.includes(team) ? "#1F2937" : "#FFFFFF";
}

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

function arrowControl(el: ExerciseSchematicElement) {
  const x1 = el.x;
  const y1 = el.y;
  const x2 = el.x2 ?? el.x;
  const y2 = el.y2 ?? el.y;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const off = 36;
  return { x: mx - ((y2 - y1) / len) * off, y: my + ((x2 - x1) / len) * off };
}

function distToQuadBezier(px: number, py: number, p1x: number, p1y: number, cx: number, cy: number, p2x: number, p2y: number) {
  let best = Infinity;
  let prev = { x: p1x, y: p1y };
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * p1x + 2 * mt * t * cx + t * t * p2x;
    const y = mt * mt * p1y + 2 * mt * t * cy + t * t * p2y;
    best = Math.min(best, distToSegment(px, py, prev.x, prev.y, x, y));
    prev = { x, y };
  }
  return best;
}

function arrowHead(x: number, y: number, angle: number, size = 9, color = "#F6C453") {
  const hx = x - size * Math.cos(angle);
  const hy = y - size * Math.sin(angle);
  const dx1 = hx + size * 0.5 * Math.sin(angle);
  const dy1 = hy - size * 0.5 * Math.cos(angle);
  const dx2 = hx - size * 0.5 * Math.sin(angle);
  const dy2 = hy + size * 0.5 * Math.cos(angle);
  return <polygon points={`${x},${y} ${dx1},${dy1} ${dx2},${dy2}`} fill={color} />;
}

function PitchMarkings({ view }: { view: SchematicView }) {
  const s = "rgba(255,255,255,0.55)";
  const g = { stroke: s, fill: "none", strokeWidth: 2 };
  if (view === "half") {
    return (
      <g {...g}>
        <rect x="8" y="8" width="284" height="434" rx="2" />
        <line x1="8" y1="225" x2="292" y2="225" strokeWidth={1.5} />
        <path d="M 100 225 A 50 50 0 0 1 200 225" strokeWidth={1.5} />
        <circle cx="150" cy="225" r="3" fill="rgba(255,255,255,0.7)" />
        <rect x="75" y="362" width="150" height="80" strokeWidth={1.5} />
        <rect x="105" y="407" width="90" height="35" strokeWidth={1.5} />
        <circle cx="150" cy="395" r="3" fill="rgba(255,255,255,0.7)" />
        <path d="M 115 362 Q 150 378 185 362" strokeWidth={1.5} />
        <rect x="120" y="442" width="60" height="8" strokeWidth={2} />
      </g>
    );
  }
  if (view === "third") {
    return (
      <g {...g}>
        <rect x="8" y="8" width="284" height="434" rx="2" />
        <line x1="8" y1="300" x2="292" y2="300" strokeWidth={1.5} />
        <rect x="75" y="342" width="150" height="80" strokeWidth={1.5} />
        <rect x="105" y="387" width="90" height="35" strokeWidth={1.5} />
        <circle cx="150" cy="375" r="3" fill="rgba(255,255,255,0.7)" />
        <path d="M 115 342 Q 150 358 185 342" strokeWidth={1.5} />
        <rect x="120" y="422" width="60" height="8" strokeWidth={2} />
      </g>
    );
  }
  if (view === "h_full") {
    return (
      <g {...g}>
        <rect x="8" y="8" width="434" height="284" rx="2" />
        <line x1="225" y1="8" x2="225" y2="292" strokeWidth={1.5} />
        <circle cx="225" cy="150" r="50" strokeWidth={1.5} />
        <circle cx="225" cy="150" r="3" fill="rgba(255,255,255,0.7)" />
        <rect x="8" y="75" width="80" height="150" strokeWidth={1.5} />
        <rect x="8" y="105" width="35" height="90" strokeWidth={1.5} />
        <circle cx="60" cy="150" r="3" fill="rgba(255,255,255,0.7)" />
        <path d="M 88 115 Q 104 150 88 185" strokeWidth={1.5} />
        <rect x="0" y="120" width="8" height="60" strokeWidth={2} />
        <rect x="362" y="75" width="80" height="150" strokeWidth={1.5} />
        <rect x="407" y="105" width="35" height="90" strokeWidth={1.5} />
        <circle cx="390" cy="150" r="3" fill="rgba(255,255,255,0.7)" />
        <path d="M 362 115 Q 346 150 362 185" strokeWidth={1.5} />
        <rect x="442" y="120" width="8" height="60" strokeWidth={2} />
      </g>
    );
  }
  if (view === "h_half") {
    return (
      <g {...g}>
        <rect x="8" y="8" width="434" height="284" rx="2" />
        <line x1="225" y1="8" x2="225" y2="292" strokeWidth={1.5} />
        <path d="M 225 100 A 50 50 0 0 1 225 200" strokeWidth={1.5} />
        <circle cx="225" cy="150" r="3" fill="rgba(255,255,255,0.7)" />
        <rect x="362" y="75" width="80" height="150" strokeWidth={1.5} />
        <rect x="407" y="105" width="35" height="90" strokeWidth={1.5} />
        <circle cx="390" cy="150" r="3" fill="rgba(255,255,255,0.7)" />
        <path d="M 362 115 Q 346 150 362 185" strokeWidth={1.5} />
        <rect x="442" y="120" width="8" height="60" strokeWidth={2} />
      </g>
    );
  }
  return (
    <g {...g}>
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
  );
}

function SchematicPitch({
  svgRef,
  view,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  svgRef?: React.Ref<SVGSVGElement>;
  view?: SchematicView;
  children?: React.ReactNode;
  onPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void;
}) {
  const dims = SCHEMATIC_VIEWS[view || "full"];
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${dims.w} ${dims.h}`}
      className="h-full w-full touch-none select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <rect x="0" y="0" width={dims.w} height={dims.h} fill="#1B7A3D" />
      <PitchMarkings view={view || "full"} />
      {children}
    </svg>
  );
}

function PlayerElement({ el, selected }: { el: ExerciseSchematicElement; selected: boolean }) {
  const team = el.team || "att";
  return (
    <g>
      <circle cx={el.x} cy={el.y} r={10} fill={TEAM_COLORS[team]} stroke="#FFFFFF" strokeWidth={1.5} />
      <text
        x={el.x}
        y={el.y + 3.5}
        textAnchor="middle"
        fontSize={9}
        fontWeight="bold"
        fill={textOn(team)}
      >
        {el.number || ""}
      </text>
      {selected && (
        <circle cx={el.x} cy={el.y} r={14} fill="none" stroke="#F6C453" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </g>
  );
}

function ConeElement({ el, selected }: { el: ExerciseSchematicElement; selected: boolean }) {
  return (
    <g>
      <polygon
        points={`${el.x},${el.y - 9} ${el.x - 6},${el.y + 7} ${el.x + 6},${el.y + 7}`}
        fill={el.color || "#F97316"}
        stroke="#FFFFFF"
        strokeWidth={1}
      />
      {selected && (
        <circle cx={el.x} cy={el.y} r={13} fill="none" stroke="#F6C453" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </g>
  );
}

function BallElement({ el, selected }: { el: ExerciseSchematicElement; selected: boolean }) {
  const motion = el.ballVariant === "motion";
  return (
    <g>
      {motion && (
        <g stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} fill="none">
          <path d={`M ${el.x + 7} ${el.y - 5} q 4 3 0 6`} />
          <path d={`M ${el.x + 10.5} ${el.y - 1} q 4 3 0 6`} />
        </g>
      )}
      <circle cx={el.x} cy={el.y} r={4.5} fill="#FFFFFF" stroke="#111111" strokeWidth={1} />
      {selected && (
        <circle cx={el.x} cy={el.y} r={9} fill="none" stroke="#F6C453" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </g>
  );
}

function ArrowElement({ el, selected }: { el: ExerciseSchematicElement; selected: boolean }) {
  const x1 = el.x;
  const y1 = el.y;
  const x2 = el.x2 ?? el.x;
  const y2 = el.y2 ?? el.y;
  const variant = el.arrowVariant || "solid";
  const color = "#F6C453";
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  let body: React.ReactElement;
  let startAngle: number | null = null;
  let endAngle: number | null = null;

  if (variant === "curved") {
    const c = arrowControl(el);
    body = (
      <path
        d={`M ${x1} ${y1} Q ${c.x} ${c.y} ${x2} ${y2}`}
        stroke={color}
        strokeWidth={2.5}
        fill="none"
      />
    );
    startAngle = Math.atan2(y1 - c.y, x1 - c.x);
    endAngle = Math.atan2(y2 - c.y, x2 - c.x);
  } else {
    body = (
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray={variant === "dashed" ? "6 4" : undefined}
      />
    );
    const ang = Math.atan2(y2 - y1, x2 - x1);
    startAngle = ang + Math.PI;
    endAngle = ang;
  }

  return (
    <g>
      {body}
      {endAngle !== null && arrowHead(x2, y2, endAngle, 9, color)}
      {variant === "double" && startAngle !== null && arrowHead(x1, y1, startAngle, 9, color)}
      {selected && (
        <circle cx={midX} cy={midY} r={7} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </g>
  );
}

function ShapeElement({ el, selected }: { el: ExerciseSchematicElement; selected: boolean }) {
  const x = Math.min(el.x, el.x2 ?? el.x);
  const y = Math.min(el.y, el.y2 ?? el.y);
  const w = Math.max(1, Math.abs((el.x2 ?? el.x) - el.x));
  const h = Math.max(1, Math.abs((el.y2 ?? el.y) - el.y));
  const cx = x + w / 2;
  const cy = y + h / 2;
  const color = el.color || "#F6C453";
  const kind = el.shapeKind || "rect";
  const strokeProps = { fill: color + "3D", stroke: color, strokeWidth: 1.5 };

  let shape: React.ReactElement;
  if (kind === "circle") {
    shape = <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} {...strokeProps} />;
  } else if (kind === "triangle") {
    shape = <polygon points={`${cx},${y} ${x + w},${y + h} ${x},${y + h}`} {...strokeProps} />;
  } else if (kind === "diamond") {
    shape = <polygon points={`${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}`} {...strokeProps} />;
  } else if (kind === "hexagon") {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      pts.push(`${(cx + (w / 2) * Math.cos(a)).toFixed(1)},${(cy + (h / 2) * Math.sin(a)).toFixed(1)}`);
    }
    shape = <polygon points={pts.join(" ")} {...strokeProps} />;
  } else {
    shape = <rect x={x} y={y} width={w} height={h} rx={2} {...strokeProps} />;
  }

  return (
    <g>
      {shape}
      {el.text ? (
        <text
          x={cx}
          y={cy + 3.5}
          textAnchor="middle"
          fontSize={9}
          fill="#FFFFFF"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={0.4}
        >
          {el.text}
        </text>
      ) : null}
      {selected && (
        <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="none" stroke="#FFFFFF" strokeWidth={1.5} strokeDasharray="4 3" />
      )}
    </g>
  );
}

function RenderElement({
  el,
  selected,
}: {
  el: ExerciseSchematicElement;
  selected: boolean;
}) {
  if (el.type === "player") return <PlayerElement el={el} selected={selected} />;
  if (el.type === "cone") return <ConeElement el={el} selected={selected} />;
  if (el.type === "ball") return <BallElement el={el} selected={selected} />;
  if (el.type === "arrow") return <ArrowElement el={el} selected={selected} />;
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
  if (el.type === "shape") return <ShapeElement el={el} selected={selected} />;
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
      if (el.arrowVariant === "curved") {
        const c = arrowControl(el);
        if (distToQuadBezier(x, y, el.x, el.y, c.x, c.y, el.x2 ?? el.x, el.y2 ?? el.y) <= 7) return el;
      } else if (distToSegment(x, y, el.x, el.y, el.x2 ?? el.x, el.y2 ?? el.y) <= 7) {
        return el;
      }
    } else if (el.type === "zone" || el.type === "shape") {
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
  { id: "shape", label: "Forme", icon: Shapes },
  { id: "label", label: "Texte", icon: Type },
];

function ColorSwatch({
  color,
  label,
  active,
  onClick,
}: {
  color: string;
  label?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`h-6 w-6 rounded-full border-2 transition-transform ${
        active ? "scale-110 border-white ring-2 ring-[var(--color-royal)]" : "border-black/20 hover:scale-105"
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

function DraftPreview({
  draft,
  dims,
}: {
  draft: { id: string; type: "zone" | "shape"; x1: number; y1: number; x2: number; y2: number } | null;
  dims: { w: number; h: number };
}) {
  if (!draft) return null;
  const x = Math.min(draft.x1, draft.x2);
  const y = Math.min(draft.y1, draft.y2);
  const w = Math.abs(draft.x2 - draft.x1);
  const h = Math.abs(draft.y2 - draft.y1);
  if (w < 1 || h < 1 || x > dims.w || y > dims.h) return null;
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill="rgba(255,255,255,0.18)"
      stroke="#F6C453"
      strokeWidth={1.5}
      strokeDasharray="5 4"
    />
  );
}

export function ExerciseSchematicView({
  schema,
}: {
  schema: ExerciseSchematic | null | undefined;
}) {
  if (!schema || !schema.elements || schema.elements.length === 0) return null;
  const view = schema.view || "full";
  const dims = SCHEMATIC_VIEWS[view];
  return (
    <div
      className="mx-auto my-2 w-full max-w-[240px] overflow-hidden rounded-lg bg-[#1B7A3D]"
      style={{ aspectRatio: dims.aspect }}
    >
      <SchematicPitch view={view}>
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
  const view = value.view || "full";
  const dims = SCHEMATIC_VIEWS[view];
  const [tool, setTool] = useState<Tool>("select");
  const [pendingTeam, setPendingTeam] = useState<TeamColor>("att");
  const [pendingConeColor, setPendingConeColor] = useState<string>("#F97316");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const [dragDraft, setDragDraft] = useState<{
    id: string;
    type: "zone" | "shape";
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
      ...value,
      elements: elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
    });
  }

  function addElement(el: ExerciseSchematicElement) {
    onChange({ ...value, elements: [...elements, el] });
  }

  function removeElement(id: string) {
    onChange({ ...value, elements: elements.filter((el) => el.id !== id) });
  }

  function toSvgPoint(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - rect.left) / rect.width) * dims.w,
      y: ((e.clientY - rect.top) / rect.height) * dims.h,
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
      addElement({ id, type: "player", x: pt.x, y: pt.y, team: pendingTeam, number: String(count) });
      setSelectedId(id);
    } else if (tool === "cone") {
      const id = crypto.randomUUID();
      addElement({ id, type: "cone", x: pt.x, y: pt.y, color: pendingConeColor });
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
    } else if (tool === "zone" || tool === "shape") {
      const id = crypto.randomUUID();
      setDragDraft({ id, type: tool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const pt = toSvgPoint(e);
    setHoverPt(pt);
    if (tool === "select" && dragRef.current) {
      const { id, offsetX, offsetY } = dragRef.current;
      updateElement(id, {
        x: clamp(pt.x + offsetX, 10, dims.w - 10),
        y: clamp(pt.y + offsetY, 10, dims.h - 10),
      });
    } else if ((tool === "zone" || tool === "shape") && dragDraft) {
      setDragDraft((prev) =>
        prev
          ? {
              ...prev,
              x2: clamp(pt.x, 5, dims.w - 5),
              y2: clamp(pt.y, 5, dims.h - 5),
            }
          : prev
      );
    }
  }

  function handlePointerUp() {
    if (tool === "select") {
      dragRef.current = null;
    } else if (dragDraft) {
      const d = dragDraft;
      setDragDraft(null);
      if (Math.abs(d.x2 - d.x1) > 5 && Math.abs(d.y2 - d.y1) > 5) {
        if (d.type === "zone") {
          addElement({ id: d.id, type: "zone", x: d.x1, y: d.y1, x2: d.x2, y2: d.y2 });
        } else {
          addElement({ id: d.id, type: "shape", x: d.x1, y: d.y1, x2: d.x2, y2: d.y2, shapeKind: "rect", color: "#F6C453" });
        }
        setSelectedId(d.id);
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
      setDragDraft(null);
    }
  }

  const selected = selectedId ? elements.find((el) => el.id === selectedId) || null : null;

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Vue du terrain</Label>
        <select
          value={view}
          onChange={(e) => onChange({ ...value, view: e.target.value as SchematicView })}
          className="h-8 min-w-44 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {Object.entries(SCHEMATIC_VIEWS).map(([id, v]) => (
            <option key={id} value={id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

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
            onChange({ ...value, elements: [] });
            setSelectedId(null);
            setArrowStart(null);
            setDragDraft(null);
          }}
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </div>

      {tool === "player" && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Couleur joueur</span>
          {(Object.keys(TEAM_COLORS) as TeamColor[]).map((t) => (
            <ColorSwatch
              key={t}
              color={TEAM_COLORS[t]}
              label={TEAM_LABELS[t]}
              active={pendingTeam === t}
              onClick={() => setPendingTeam(t)}
            />
          ))}
        </div>
      )}
      {tool === "cone" && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2">
          <span className="mr-1 text-[10px] uppercase tracking-wide text-muted-foreground">Couleur cône</span>
          {CONE_COLORS.map((c) => (
            <ColorSwatch
              key={c.value}
              color={c.value}
              label={c.label}
              active={pendingConeColor === c.value}
              onClick={() => setPendingConeColor(c.value)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col items-start gap-3 sm:flex-row">
        <div className="w-full flex-1">
          <div
            className="mx-auto w-full max-w-[300px] overflow-hidden rounded-xl bg-[#1B7A3D] shadow-lg"
            style={{ aspectRatio: dims.aspect }}
          >
            <SchematicPitch
              svgRef={svgRef}
              view={view}
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
              <DraftPreview draft={dragDraft} dims={dims} />
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
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Couleur</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(TEAM_COLORS) as TeamColor[]).map((t) => (
                        <ColorSwatch
                          key={t}
                          color={TEAM_COLORS[t]}
                          label={TEAM_LABELS[t]}
                          active={selected.team === t}
                          onClick={() => updateElement(selected.id, { team: t })}
                        />
                      ))}
                    </div>
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
              {selected.type === "cone" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Couleur</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {CONE_COLORS.map((c) => (
                      <ColorSwatch
                        key={c.value}
                        color={c.value}
                        label={c.label}
                        active={selected.color === c.value}
                        onClick={() => updateElement(selected.id, { color: c.value })}
                      />
                    ))}
                  </div>
                </div>
              )}
              {selected.type === "ball" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</Label>
                  <select
                    value={selected.ballVariant || "classic"}
                    onChange={(e) =>
                      updateElement(selected.id, {
                        ballVariant: e.target.value as ExerciseSchematicElement["ballVariant"],
                      })
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="classic">Classique</option>
                    <option value="motion">En mouvement</option>
                  </select>
                </div>
              )}
              {selected.type === "arrow" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Type de flèche</Label>
                  <select
                    value={selected.arrowVariant || "solid"}
                    onChange={(e) =>
                      updateElement(selected.id, {
                        arrowVariant: e.target.value as ExerciseSchematicElement["arrowVariant"],
                      })
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    {ARROW_VARIANTS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
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
              {selected.type === "shape" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Forme</Label>
                    <select
                      value={selected.shapeKind || "rect"}
                      onChange={(e) =>
                        updateElement(selected.id, {
                          shapeKind: e.target.value as ExerciseSchematicElement["shapeKind"],
                        })
                      }
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                    >
                      {SHAPE_KINDS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Couleur</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {CONE_COLORS.map((c) => (
                        <ColorSwatch
                          key={c.value}
                          color={c.value}
                          label={c.label}
                          active={selected.color === c.value}
                          onClick={() => updateElement(selected.id, { color: c.value })}
                        />
                      ))}
                      <ColorSwatch
                        color="#F6C453"
                        label="Or"
                        active={selected.color === "#F6C453"}
                        onClick={() => updateElement(selected.id, { color: "#F6C453" })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Libellé (optionnel)</Label>
                    <Input
                      value={selected.text || ""}
                      onChange={(e) => updateElement(selected.id, { text: e.target.value })}
                      placeholder="Ex : Zone de travail"
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
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
              {tool === "select"
                ? "Clique sur un élément puis glisse pour le déplacer."
                : `Clique sur le terrain pour ajouter un élément (${TOOLS.find((t) => t.id === tool)?.label.toLowerCase()}).`}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Joueurs, cônes, ballons, zones, formes et flèches de déplacement. Plusieurs vues de terrain disponibles.
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
            className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
          >
            Enregistrer le schéma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
