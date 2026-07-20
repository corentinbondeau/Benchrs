"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const senderName = message.sender
    ? `${(message.sender as unknown as { first_name: string }).first_name} ${(message.sender as unknown as { last_name: string }).last_name}`
    : "Utilisateur";

  const initials = senderName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <div
      className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div
        className={`max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{senderName}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div
          className={`rounded-xl px-4 py-2 text-sm ${
            isOwn
              ? "bg-[var(--royal)] text-white rounded-tr-none"
              : "bg-muted rounded-tl-none"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
