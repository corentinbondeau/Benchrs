"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
}

export function MessageBubble({ message, isOwn, onEdit, onDelete }: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const senderName = message.sender
    ? `${(message.sender as unknown as { first_name: string }).first_name} ${(message.sender as unknown as { last_name: string }).last_name}`
    : "Utilisateur";

  const initials = senderName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2);

  function handleEditSubmit() {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent.trim());
      setEditing(false);
    }
  }

  return (
    <div className={`flex gap-3 group ${isOwn ? "flex-row-reverse" : ""}`}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{senderName}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {message.is_edited && (
            <span className="text-xs text-muted-foreground italic">(édité)</span>
          )}
        </div>
        {editing ? (
          <div className="flex gap-1">
            <Input
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEditSubmit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="text-sm h-8"
              autoFocus
            />
            <Button size="sm" onClick={handleEditSubmit} className="h-8 px-2">
              OK
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-8 px-2">
              Annuler
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-1">
            <div
              className={`rounded-xl px-4 py-2 text-sm ${
                isOwn
                  ? "bg-[var(--royal)] text-white rounded-tr-none"
                  : "bg-muted rounded-tl-none"
              }`}
            >
              {message.content}
            </div>
            {isOwn && (
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => {
                    setEditContent(message.content);
                    setEditing(true);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => onDelete?.(message.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
