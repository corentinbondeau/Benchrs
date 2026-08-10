"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardCheck, Plus, Trash2, Loader2, Check, Send } from "lucide-react";
import { toast } from "sonner";
import type { MatchChecklistItem, MatchChecklistAck } from "@/types";

interface MatchChecklistProps {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  myPlayerId: string | null;
}

export function MatchChecklist({ eventId, teamId, isCoach, myPlayerId }: MatchChecklistProps) {
  const [items, setItems] = useState<MatchChecklistItem[]>([]);
  const [acks, setAcks] = useState<MatchChecklistAck[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const myAck = myPlayerId ? acks.some((a) => a.player_id === myPlayerId) : false;

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [itemsRes, acksRes] = await Promise.all([
      supabase.from("match_checklist_items").select("*").eq("event_id", eventId).order("sort_order"),
      supabase.from("match_checklist_acks").select("*").eq("event_id", eventId),
    ]);
    return {
      items: (itemsRes.data as MatchChecklistItem[]) || [],
      acks: (acksRes.data as MatchChecklistAck[]) || [],
    };
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    loadData().then((res) => {
      if (cancelled) return;
      setItems(res.items);
      setAcks(res.acks);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function addItem() {
    const label = newLabel.trim();
    if (!label) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("match_checklist_items").insert({
      event_id: eventId,
      team_id: teamId,
      label,
      sort_order: items.length,
    });
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de l'ajout");
      return;
    }
    setNewLabel("");
    loadData().then(setItemsAndAcks);
    toast.success("Élément ajouté à la checklist");
  }

  async function removeItem(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("match_checklist_items").delete().eq("id", id);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    loadData().then(setItemsAndAcks);
  }

  async function toggleAck() {
    if (!myPlayerId) return;
    setSaving(true);
    const supabase = createClient();
    if (myAck) {
      await supabase.from("match_checklist_acks").delete().eq("event_id", eventId).eq("player_id", myPlayerId);
    } else {
      await supabase.from("match_checklist_acks").insert({
        event_id: eventId,
        player_id: myPlayerId,
        team_id: teamId,
      });
    }
    setSaving(false);
    loadData().then((res) => setAcks(res.acks));
  }

  function setItemsAndAcks(res: { items: MatchChecklistItem[]; acks: MatchChecklistAck[] }) {
    setItems(res.items);
    setAcks(res.acks);
  }

  async function notifyPlayers() {
    setNotifying(true);
    const supabase = createClient();
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .in("role", ["player"]);
    const playerIds = (members || []).map((m) => m.user_id);
    let userIds: string[] = [];
    if (playerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .in("id", playerIds)
        .eq("is_active", true);
      const activePlayerIds = (profiles || []).map((p) => p.id);
      const { data: links } = await supabase
        .from("parent_student")
        .select("parent_id")
        .eq("team_id", teamId)
        .in("student_id", activePlayerIds);
      const parentIds = [...new Set((links || []).map((l) => (l as { parent_id: string }).parent_id))];
      userIds = [...new Set([...activePlayerIds, ...parentIds])];
    }
    setNotifying(false);
    if (userIds.length === 0) {
      toast.error("Aucun joueur actif à notifier");
      return;
    }
    const res = await authFetch("/api/notifications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_ids: userIds,
        team_id: teamId,
        type: "match_checklist",
        title: "Checklist avant-match",
        body: "Une nouvelle checklist a été publiée pour le prochain match — vérifie que tu as bien tout.",
        url: `/matches/${eventId}`,
      }),
    });
    if (!res.ok) {
      toast.error("Erreur lors de l'envoi des notifications");
      return;
    }
    toast.success("Joueurs notifiés");
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-[var(--color-royal)]" />
          Checklist avant-match
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && !isCoach && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Le coach n&apos;a pas encore publié de checklist.
          </p>
        )}

        <ul className="space-y-1.5">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-navy)] text-[10px] font-bold text-white shrink-0">
                  {index + 1}
                </span>
                <span className="truncate">{item.label}</span>
              </span>
              {isCoach && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-muted-foreground hover:text-red-600 shrink-0"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {isCoach ? (
          <div className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Ex. Protège-tibias, gourde…"
              className="h-9"
            />
            <Button size="sm" onClick={addItem} disabled={saving || !newLabel.trim()} className="shrink-0">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        ) : (
          myPlayerId && (
            <Button
              variant={myAck ? "outline" : "default"}
              onClick={toggleAck}
              disabled={saving}
              className={myAck ? "text-green-700 border-green-300" : "bg-[var(--color-royal)] text-white hover:bg-[var(--color-royal)]/90 w-full"}
              size="sm"
            >
              {myAck ? <Check className="mr-1 h-4 w-4" /> : <ClipboardCheck className="mr-1 h-4 w-4" />}
              {myAck ? "J'ai pris connaissance ✓" : "Je confirme avoir tout"}
            </Button>
          )
        )}

        {isCoach && items.length > 0 && (
          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {acks.length} joueur{acks.length > 1 ? "s" : ""} ont confirmé
              </span>
              <Button size="sm" variant="outline" onClick={notifyPlayers} disabled={notifying}>
                {notifying ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                Notifier les joueurs
              </Button>
            </div>
            {acks.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {acks.length} confirmation{acks.length > 1 ? "s" : ""} reçue{acks.length > 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
