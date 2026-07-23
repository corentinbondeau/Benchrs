"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import type { ChatChannel, ChatMessage } from "@/types";

interface MessageWithSender extends Omit<ChatMessage, "sender"> {
  sender?: { first_name: string; last_name: string } | null;
}

export default function ChatPage() {
  const { user } = useAuth();
  const role = user?.profile?.role;
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("chat_channels")
      .select("*")
      .order("name")
      .then(({ data }) => {
        const all = (data as ChatChannel[]) || [];
        const visible = all.filter((ch) => {
          if (ch.channel_type === "general") return true;
          if (ch.channel_type === "parents") return role === "parent" || role === "coach";
          if (ch.channel_type === "coaches") return role === "coach";
          return false;
        });
        setChannels(visible);
        setLoading(false);
      });
  }, [role]);

  useEffect(() => {
    if (!selectedChannel) return;
    const supabase = createClient();

    supabase
      .from("chat_messages")
      .select("*, sender:profiles!chat_messages_sender_id_fkey(first_name, last_name)")
      .eq("channel_id", selectedChannel)
      .order("created_at", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setMessages((data as MessageWithSender[]) || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      });

    const channel = supabase
      .channel(`chat:${selectedChannel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${selectedChannel}` }, async (payload) => {
        const msg = payload.new as MessageWithSender;
        if (msg.sender_id === user?.id) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", msg.sender_id)
          .single();
        setMessages((prev) => [...prev, { ...msg, sender: profile }]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedChannel, user?.id]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChannel || !user?.id) return;

    const content = newMessage.trim();
    setNewMessage("");

    const optimisticMsg: MessageWithSender = {
      id: crypto.randomUUID(),
      channel_id: selectedChannel,
      sender_id: user.id,
      content,
      is_edited: false,
      created_at: new Date().toISOString(),
      sender: user.profile ? { first_name: user.profile.first_name, last_name: user.profile.last_name } : null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const supabase = createClient();
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: selectedChannel,
      sender_id: user.id,
      content,
    });

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    }
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-lg border overflow-hidden">
      {/* Channel List */}
      <div className="w-64 border-r bg-muted/30 overflow-y-auto shrink-0">
        <div className="p-3 border-b">
          <h3 className="font-semibold text-sm">Canaux</h3>
        </div>
        <div className="p-1">
          {channels.map((channel) => (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel.id)}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                selectedChannel === channel.id
                  ? "bg-[var(--color-royal)] text-white"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              {channel.name}
            </button>
          ))}
          {channels.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">Aucun canal</p>
          )}
        </div>
      </div>

      {/* Chat Window */}
      {selectedChannel ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 ${isMe ? "bg-[var(--color-royal)] text-white" : "bg-muted"}`}>
                    {!isMe && (
                      <p className="text-xs font-medium mb-1 opacity-70">
                        {msg.sender?.first_name} {msg.sender?.last_name}
                      </p>
                    )}
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={sendMessage} className="p-3 border-t flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Votre message..."
              className="flex-1"
            />
            <Button type="submit" size="icon" className="bg-[var(--color-royal)] text-white" disabled={!newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg">Sélectionnez un canal</p>
            <p className="text-sm mt-1">pour commencer à discuter</p>
          </div>
        </div>
      )}
    </div>
  );
}
