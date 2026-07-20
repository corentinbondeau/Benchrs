"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { useChat } from "@/hooks/useChat";
import type { ChatChannel } from "@/types";
import { Hash, Users } from "lucide-react";

interface ChannelListProps {
  selectedChannelId: string | null;
  onSelectChannel: (id: string) => void;
}

export function ChannelList({
  selectedChannelId,
  onSelectChannel,
}: ChannelListProps) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const { data: session } = useSession();

  useEffect(() => {
    const supabase = createClient();
    async function fetchChannels() {
      const { data } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("is_private", false)
        .order("name");

      setChannels((data as ChatChannel[]) || []);
    }
    fetchChannels();
  }, []);

  return (
    <div className="w-full lg:w-64 border-r bg-card flex flex-col">
      <div className="p-3 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Hash className="h-4 w-4" />
          Canaux
        </h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => onSelectChannel(channel.id)}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                selectedChannelId === channel.id
                  ? "bg-[var(--royal)] text-white"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Hash className="inline h-3 w-3 mr-1" />
              {channel.name}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ChatWindow({ channelId }: { channelId: string }) {
  const { data: session } = useSession();
  const { messages, loading, sendMessage, editMessage, deleteMessage, scrollRef } = useChat(channelId);

  async function handleSend(content: string) {
    if (!session?.user?.id) return;
    await sendMessage(content, session.user.id);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === session?.user?.id}
              onEdit={editMessage}
              onDelete={deleteMessage}
            />
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
      <MessageInput onSend={handleSend} />
    </div>
  );
}
