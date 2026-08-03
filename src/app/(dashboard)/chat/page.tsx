"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Send, Plus, Loader2 } from "lucide-react";
import type { ChatChannel, ChatMessage, Profile } from "@/types";

interface MessageWithSender extends Omit<ChatMessage, "sender"> {
  sender?: { first_name: string; last_name: string } | null;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create channel state
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [allMembers, setAllMembers] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    supabase
      .from("chat_channels")
      .select("*")
      .eq("team_id", currentTeam!.id)
      .order("name")
      .then(({ data }) => {
        const all = (data as ChatChannel[]) || [];
        const visible = all.filter((ch) => {
          if (ch.channel_type === "general") return true;
          if (ch.channel_type === "parents") return userRole === "parent" || userRole === "coach" || userRole === "owner";
          if (ch.channel_type === "coaches") return userRole === "coach" || userRole === "owner";
          return true;
        });
        setChannels(visible);
        setLoading(false);
      });
  }, [userRole, currentTeam]);

  useEffect(() => {
    if (!currentTeam || !createOpen) return;
    const supabase = createClient();
    supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", currentTeam!.id)
      .then(({ data: rows }) => {
        if (!rows || rows.length === 0) return;
        supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", rows.map((r) => r.user_id))
          .order("last_name", { ascending: true })
          .then(({ data }) =>
            setAllMembers(
              ((data as Profile[]) || []).filter((m) => m.id !== user?.id)
            )
          );
      });
  }, [currentTeam, createOpen, user?.id]);

  useEffect(() => {
    if (!selectedChannel) return;
    const supabase = createClient();

    supabase
      .from("chat_messages")
      .select("*, sender:profiles!chat_messages_sender_id_fkey(first_name, last_name)")
      .eq("team_id", currentTeam!.id)
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

  async function createChannel() {
    if (!channelName.trim() || !currentTeam || !user) return;
    setCreating(true);
    const supabase = createClient();

    const { data: channel, error } = await supabase
      .from("chat_channels")
      .insert({
        name: channelName.trim(),
        description: null,
        is_private: false,
        channel_type: "general",
        team_id: currentTeam.id,
      })
      .select()
      .single();

    if (error || !channel) {
      const { toast } = await import("sonner");
      toast.error("Erreur lors de la création du canal");
      setCreating(false);
      return;
    }

    const memberIds = [...new Set([...selectedMembers, user.id])];
    const { error: memberError } = await supabase
      .from("chat_members")
      .insert(memberIds.map((userId) => ({
        channel_id: channel.id,
        user_id: userId,
        team_id: currentTeam.id,
      })));

    if (memberError) {
      const { toast } = await import("sonner");
      toast.error("Erreur lors de l'ajout des membres");
    }

    setChannels((prev) => [...prev, channel]);
    setSelectedChannel(channel.id);
    setChannelName("");
    setSelectedMembers([]);
    setCreateOpen(false);
    setCreating(false);
  }

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
      team_id: currentTeam!.id,
      created_at: new Date().toISOString(),
      sender: user.profile ? { first_name: user.profile.first_name, last_name: user.profile.last_name } : null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    const supabase = createClient();
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: selectedChannel,
      sender_id: user.id,
      content,
      team_id: currentTeam!.id,
    });

    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    }
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l&apos;équipe...</p></div>;
  }

  if (loading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-royal)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="pb-20 md:pb-0">
      {/* Mobile: channel list */}
      <div className="md:hidden">
        {selectedChannel ? (
          <div className="flex flex-col h-[calc(100vh-8rem-5rem)] md:h-[calc(100vh-8rem)]">
          {/* Mobile channel header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
            <button
              onClick={() => setSelectedChannel(null)}
              className="md:hidden text-sm text-[var(--color-royal)] font-medium"
            >
              ← Canaux
            </button>
            <h3 className="font-semibold text-sm">
              {channels.find((c) => c.id === selectedChannel)?.name}
            </h3>
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] md:max-w-[70%] rounded-lg px-3 py-2 ${isMe ? "bg-[var(--color-royal)] text-white" : "bg-muted"}`}>
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
          {/* Input */}
          <form onSubmit={sendMessage} className="p-3 border-t flex gap-2 shrink-0">
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
        <div className="flex flex-col h-[calc(100vh-8rem-5rem)] md:h-[calc(100vh-8rem)]">
          {/* Channel list header */}
          <div className="p-3 border-b flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-base">Canaux</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--color-gold)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {/* Channel list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => setSelectedChannel(channel.id)}
                className="w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted active:bg-muted/80 touch-manipulation"
              >
                {channel.name}
              </button>
            ))}
            {channels.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Aucun canal</p>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Desktop: split view */}
      <div className="hidden md:flex rounded-lg border overflow-hidden h-[calc(100vh-8rem)]">
        <div className="w-64 border-r bg-muted/30 overflow-y-auto shrink-0 flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Canaux</h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--color-gold)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 p-1 overflow-y-auto">
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau canal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="channelName">Nom du canal</Label>
              <Input
                id="channelName"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Ex: Match du samedi"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !creating) createChannel();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Membres du canal</Label>
              <ScrollArea className="h-56 rounded-md border p-2">
                {allMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedMembers.includes(member.id)}
                      onCheckedChange={(checked) =>
                        setSelectedMembers(
                          checked
                            ? [...selectedMembers, member.id]
                            : selectedMembers.filter((id) => id !== member.id)
                        )
                      }
                    />
                    <span className="text-sm">
                      {member.first_name} {member.last_name}
                    </span>
                  </label>
                ))}
                {allMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aucun membre disponible
                  </p>
                )}
              </ScrollArea>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10">
                Annuler
              </Button>
              <Button
                onClick={createChannel}
                disabled={!channelName.trim() || creating}
                className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Création...
                  </>
                ) : (
                  "Créer le canal"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
