"use client";

import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

interface DraggableEventProps {
  /** UUID de l'événement — sert d'identifiant dnd-kit */
  id: string;
  /** Rendu interne de l'événement (badge, bouton, etc.) */
  children: ReactNode;
  /** Désactive le drag (joueurs / parents) */
  disabled?: boolean;
}

/**
 * Wrapper qui rend un événement glissable dans le calendrier.
 * Uniquement actif pour les coaches/owners (contrôlé via `disabled`).
 */
export function DraggableEvent({ id, children, disabled = false }: DraggableEventProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, transform } =
    useDraggable({ id, disabled });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-0.5 w-full ${isDragging ? "opacity-50" : ""}`}
    >
      {/* Handle de drag — seul élément qui capte les événements pointeur */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label="Déplacer cet événement"
        className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors p-0.5 -ml-0.5 rounded"
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
