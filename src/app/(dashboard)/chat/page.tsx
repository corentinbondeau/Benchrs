"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { useChatUnread } from "@/lib/useChatUnread";
import { useSelectedChild } from "@/lib/useSelectedChild";
import { fetchTeamActivePlayers } from "@/lib/players";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ensureChatMemberships,
  fetchChannelRecipients,
  channelVisibleForRole,
} from "@/lib/chat";
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
import { ChannelSettingsDialog } from "@/components/chat/ChannelSettingsDialog";
import { Send, Plus, Loader2, Settings, User, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import type { ChatChannel, ChatMessage, Profile } from "@/types";

interface MessageWithSender extends Omit<ChatMessage, "sender"> {
  sender?: { first_name: string; last_name: string } | null;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = currentTeam?.id ?? null;
  const { children } = useSelectedChild(teamId ?? undefined);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Conversations privées par joueur (coach <-> parents)
  const [playerConversations, setPlayerConversations] = useState<Profile[]>([]);

  // Create channel state
  const [createOpen, setCreateOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [allMembers, setAllMembers] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);

  // Channel settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsChannel, setSettingsChannel] = useState<ChatChannel | null>(null);

  const { counts: unreadCounts } = useChatUnread(teamId, user?.id, userRole ?? undefined);

  const selectedChannelObj = channels.find((c) => c.id === selectedChannel) || null;

  useEffect(() => {
    if (!currentTeam || !user) return;
    const team = currentTeam;
    const me = user;
    let ignore = false;
    async function load() {
      const supabase = createClient();

      const { data: all } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("team_id", team.id)
        .order("name");
      const roleVisible =
        (all as ChatChannel[] | null)?.filter(
          (ch) =>
            ch.channel_type === "custom" ||
            ch.channel_type === "player" ||
            channelVisibleForRole(ch, userRole ?? undefined)
        ) || [];

      await ensureChatMemberships(team.id, me.id, userRole ?? undefined);

      const { data: rows } = await supabase
        .from("chat_members")
        .select("channel_id, left_at")
        .eq("user_id", me.id)
        .eq("team_id", team.id);
      const rowMap = new Map(
        (rows || []).map((r) => [r.channel_id, r.left_at as string | null])
      );

      const visible = roleVisible.filter((ch) => {
        const leftAt = rowMap.get(ch.id);
        return leftAt === null;
      });

      if (ignore) return;
      setChannels(visible);
      setSelectedChannel((prev) =>
        prev && visible.some((c) => c.id === prev) ? prev : null
      );
      setLoading(false);
    }
    load();
    return () => { ignore = true; };
  }, [currentTeam, user, userRole]);

  // Liste des joueurs pour les conversations privées (coach)
  useEffect(() => {
    if (!currentTeam || userRole !== "coach" && userRole !== "owner") return;
    let ignore = false;
    fetchTeamActivePlayers(currentTeam.id).then((players) => {
      if (ignore) return;
      setPlayerConversations(players);
    });
    return () => { ignore = true; };
  }, [currentTeam, userRole]);

  const openPlayerChannel = useCallback(
    async (playerId: string): Promise<ChatChannel | null> => {
      if (!currentTeam || !user) return null;
      try {
        const res = await authFetch("/api/chat/player-channel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: currentTeam.id, playerId }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Impossible d'ouvrir la conversation");
          return null;
        }
        return data.channel as ChatChannel;
      } catch (e) {
        toast.error(String(e));
        return null;
      }
    },
    [currentTeam, user]
  );

  function applyPlayerChannel(ch: ChatChannel | null) {
    if (!ch) return;
    setChannels((prev) =>
      prev.some((c) => c.id === ch.id) ? prev : [...prev, ch]
    );
    setSelectedChannel(ch.id);
  }

  // Ouverture directe via /chat?player=<id> (ex: bouton "Discuter" sur l'effectif)
  useEffect(() => {
    const pid = searchParams?.get("player");
    if (!pid) return;
    openPlayerChannel(pid).then(applyPlayerChannel);
    router.replace("/chat", { scroll: false });
  }, [searchParams, currentTeam, user, router, openPlayerChannel]);

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
    if (!selectedChannel || !currentTeam) return;
    const supabase = createClient();

    async function markRead() {
      if (!user?.id) return;
      await supabase
        .from("chat_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("channel_id", selectedChannel)
        .eq("user_id", user.id);
    }

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

    markRead();

    const channel = supabase
      .channel(`chat:${currentTeam!.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `team_id=eq.${currentTeam!.id}` },
        async (payload) => {
          const msg = payload.new as MessageWithSender;
          if (msg.channel_id !== selectedChannel) return;
          if (msg.sender_id === user?.id) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", msg.sender_id)
            .single();
          setMessages((prev) => [...prev, { ...msg, sender: profile }]);
          markRead();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedChannel, currentTeam, user?.id]);

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
        channel_type: "custom",
        is_default: false,
        created_by: user.id,
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

    // Notification aux membres ajoutés (pas au créateur)
    if (selectedMembers.length > 0) {
      authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: selectedMembers,
          title: `Nouveau canal : ${channelName.trim()}`,
          body: `Vous avez été ajouté au canal ${channelName.trim()}`,
          type: "message",
          reference_id: channel.id,
          team_id: currentTeam.id,
          url: "/chat",
        }),
      });
    }

    setChannels((prev) => [...prev, channel as ChatChannel]);
    setSelectedChannel(channel.id);
    setChannelName("");
    setSelectedMembers([]);
    setCreateOpen(false);
    setCreating(false);
  }

  async function notifyMessage(channel: ChatChannel, content: string) {
    if (!currentTeam || !user?.id) return;
    try {
      const recipients = await fetchChannelRecipients(channel, currentTeam.id);
      const others = recipients.filter((uid) => uid !== user.id);
      if (others.length === 0) return;
      const senderName = user.profile
        ? `${user.profile.first_name} ${user.profile.last_name}`.trim()
        : "Quelqu'un";
      const res = await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: others,
          title: channel.name,
          body: `${senderName} : ${content.slice(0, 100)}`,
          type: "message",
          reference_id: channel.id,
          team_id: currentTeam.id,
          url: "/chat",
        }),
      });
      if (!res.ok) {
        console.error(
          "[chat] notification send échouée",
          res.status,
          await res.text().catch(() => null)
        );
      } else {
        const data = await res.json().catch(() => null);
        console.info("[chat] notification envoyée", data);
      }
    } catch (err) {
      console.error("[chat] notification send exception", err);
    }
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
      return;
    }

    await supabase
      .from("chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", selectedChannel)
      .eq("user_id", user.id);
    if (selectedChannelObj) notifyMessage(selectedChannelObj, content);
  }

  function openSettings(channel: ChatChannel) {
    setSettingsChannel(channel);
    setSettingsOpen(true);
  }

  function handleSettingsOpenChange(open: boolean) {
    setSettingsOpen(open);
    if (!open) setSettingsChannel(null);
  }

  function onRenamed(name: string) {
    setChannels((prev) =>
      prev.map((c) => (c.id === settingsChannel?.id ? { ...c, name } : c))
    );
    setSettingsChannel((prev) => (prev ? { ...prev, name } : prev));
  }

  function onDeleted() {
    if (settingsChannel) {
      setChannels((prev) => prev.filter((c) => c.id !== settingsChannel.id));
      if (selectedChannel === settingsChannel.id) setSelectedChannel(null);
    }
    handleSettingsOpenChange(false);
  }

  function onLeft() {
    if (settingsChannel) {
      setChannels((prev) => prev.filter((c) => c.id !== settingsChannel.id));
      if (selectedChannel === settingsChannel.id) setSelectedChannel(null);
    }
    handleSettingsOpenChange(false);
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

  const channelUnread = (channelId: string) => unreadCounts[channelId] || 0;

  const isCoachRole = userRole === "coach" || userRole === "owner";
  const conversationTargets = isCoachRole
    ? (playerConversations as { id: string; first_name: string; last_name: string }[])
    : (children as { id: string; first_name: string; last_name: string }[]);

  const channelList = (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {conversationTargets.length > 0 && (
        <>
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Conversations joueur
          </p>
          {conversationTargets.map((p) => {
            const existing = channels.find((c) => c.player_id === p.id);
            const unread = existing ? channelUnread(existing.id) : 0;
            return (
              <button
                key={p.id}
                onClick={() =>
                  existing
                    ? setSelectedChannel(existing.id)
                    : openPlayerChannel(p.id).then(applyPlayerChannel)
                }
                className="w-full text-left rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted active:bg-muted/80 touch-manipulation"
              >
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-[var(--color-royal)] shrink-0" />
                  <span className="flex-1 truncate">
                    {p.first_name} {p.last_name}
                  </span>
                  {unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-gold)] px-1.5 text-[11px] font-semibold text-[var(--color-navy)]">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          <div className="my-1 border-t" />
        </>
      )}
      {channels.map((channel) => {
        const unread = channelUnread(channel.id);
        return (
          <button
            key={channel.id}
            onClick={() => setSelectedChannel(channel.id)}
            className={`w-full text-left rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted active:bg-muted/80 touch-manipulation ${
              selectedChannel === channel.id ? "bg-muted" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              {channel.channel_type === "player" && (
                <User className="h-3.5 w-3.5 text-[var(--color-royal)] shrink-0" />
              )}
              <span className="flex-1 truncate">{channel.name}</span>
              {unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-gold)] px-1.5 text-[11px] font-semibold text-[var(--color-navy)]">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </div>
          </button>
        );
      })}
      {channels.length === 0 && conversationTargets.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title="Aucun canal"
          description="Créez un canal pour commencer à discuter."
        />
      )}
    </div>
  );

  const messageThread = (
    <>
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
    </>
  );

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
              <h3 className="font-semibold text-sm flex-1 truncate">
                {channels.find((c) => c.id === selectedChannel)?.name}
              </h3>
              {selectedChannelObj && selectedChannelObj.channel_type !== "player" && (
                <button
                  onClick={() => openSettings(selectedChannelObj)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Paramètres du canal"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
            {messageThread}
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
            {channelList}
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
            {conversationTargets.length > 0 && (
              <div className="pb-1">
                <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Conversations joueur
                </p>
                {conversationTargets.map((p) => {
                  const existing = channels.find((c) => c.player_id === p.id);
                  const unread = existing ? channelUnread(existing.id) : 0;
                  const selected = existing && selectedChannel === existing.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() =>
                        existing
                          ? setSelectedChannel(existing.id)
                          : openPlayerChannel(p.id).then(applyPlayerChannel)
                      }
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                        selected
                          ? "bg-[var(--color-royal)] text-white"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="flex-1 truncate">
                        {p.first_name} {p.last_name}
                      </span>
                      {unread > 0 && (
                        <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                          selected
                            ? "bg-white text-[var(--color-navy)]"
                            : "bg-[var(--color-gold)] text-[var(--color-navy)]"
                        }`}>
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
                <div className="my-1 mx-1 border-t" />
              </div>
            )}
            {channels.map((channel) => {
              const unread = channelUnread(channel.id);
              return (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel.id)}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                    selectedChannel === channel.id
                      ? "bg-[var(--color-royal)] text-white"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  {channel.channel_type === "player" && (
                    <User className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{channel.name}</span>
                  {unread > 0 && (
                    <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                      selectedChannel === channel.id
                        ? "bg-white text-[var(--color-navy)]"
                        : "bg-[var(--color-gold)] text-[var(--color-navy)]"
                    }`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
              );
            })}
            {channels.length === 0 && conversationTargets.length === 0 && (
              <EmptyState
                icon={MessageSquare}
                title="Aucun canal"
                description="Créez un canal pour commencer à discuter."
              />
            )}
          </div>
        </div>
        {selectedChannel ? (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
              <h3 className="font-semibold text-sm flex-1 truncate">
                {channels.find((c) => c.id === selectedChannel)?.name}
              </h3>
              {selectedChannelObj && selectedChannelObj.channel_type !== "player" && (
                <button
                  onClick={() => openSettings(selectedChannelObj)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Paramètres du canal"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
            </div>
            {messageThread}
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
                className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
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

      <ChannelSettingsDialog
        key={settingsChannel?.id ?? "none"}
        open={settingsOpen}
        onOpenChange={handleSettingsOpenChange}
        channel={settingsChannel}
        myUserId={user?.id || ""}
        teamId={currentTeam.id}
        onRenamed={onRenamed}
        onDeleted={onDeleted}
        onLeft={onLeft}
      />
    </div>
  );
}
