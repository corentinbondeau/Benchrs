"use client";

import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";

interface DroppableDayProps {
  /** Chaîne de date au format YYYY-MM-DD — sert d'identifiant de la zone */
  dateStr: string;
  children: ReactNode;
  className?: string;
}

/**
 * Zone de dépôt pour un jour du calendrier.
 * Ajoute un highlight visuel quand un événement est glissé au-dessus.
 */
export function DroppableDay({ dateStr, children, className = "" }: DroppableDayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateStr });

  return (
    <div
      ref={setNodeRef}
      className={`${className} transition-colors duration-150 ${
        isOver ? "bg-blue-100 dark:bg-blue-900/30 ring-1 ring-inset ring-blue-400 dark:ring-blue-600" : ""
      }`}
    >
      {children}
    </div>
  );
}
