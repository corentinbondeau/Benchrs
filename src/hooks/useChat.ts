"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/types";

export function useChat(channelId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*, sender:profiles!chat_messages_sender_id_fkey(first_name, last_name, avatar_url)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(100);

    if (!error && data) {
      setMessages(data as ChatMessage[]);
    }
    setLoading(false);
  }, [channelId, supabase]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const { data } = await supabase
            .from("profiles")
            .select("first_name, last_name, avatar_url")
            .eq("id", payload.new.sender_id)
            .single();

          const newMsg: ChatMessage = {
            ...(payload.new as ChatMessage),
            sender: data as ChatMessage["sender"],
          };
          setMessages((prev) => [...prev, newMsg]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, supabase]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string, senderId: string) => {
      const { error } = await supabase.from("chat_messages").insert({
        channel_id: channelId,
        sender_id: senderId,
        content,
      });
      return !error;
    },
    [channelId, supabase]
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      const { error } = await supabase
        .from("chat_messages")
        .update({ content, is_edited: true })
        .eq("id", messageId);
      if (!error) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content, is_edited: true } : m))
        );
      }
      return !error;
    },
    [supabase]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const { error } = await supabase
        .from("chat_messages")
        .delete()
        .eq("id", messageId);
      if (!error) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      return !error;
    },
    [supabase]
  );

  return { messages, loading, sendMessage, editMessage, deleteMessage, scrollRef };
}
