"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Users, Bell, Pencil, UserPlus, Trash2, LogOut } from "lucide-react";
import type { ChatChannel, Profile } from "@/types";

interface ChannelSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: ChatChannel | null;
  myUserId: string;
  teamId: string;
  onRenamed: (name: string) => void;
  onDeleted: () => void;
  onLeft: () => void;
}

export function ChannelSettingsDialog({
  open,
  onOpenChange,
  channel,
  myUserId,
  teamId,
  onRenamed,
  onDeleted,
  onLeft,
}: ChannelSettingsDialogProps) {
  const [members, setMembers] = useState<Profile[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [notifsEnabled, setNotifsEnabled] = useState(true);
  const [renameValue, setRenameValue] = useState(channel?.name ?? "");
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCreator = !!channel && channel.created_by === myUserId;
  const isDefault = !!channel?.is_default;
  const canLeave = !!channel && !isDefault && !isCreator;

  useEffect(() => {
    if (!open || !channel) return;
    const supabase = createClient();
    let ignore = false;

    const chId = channel.id;

    async function load() {
      const [membersRes, allRes, myRow] = await Promise.all([
        supabase
          .from("chat_members")
          .select("user_id")
          .eq("channel_id", chId)
          .is("left_at", null),
        supabase
          .from("team_members")
          .select("user_id")
          .eq("team_id", teamId),
        supabase
          .from("chat_members")
          .select("notifications_enabled, left_at")
          .eq("channel_id", chId)
          .eq("user_id", myUserId)
          .maybeSingle(),
      ]);
      if (ignore) return;

      const memberIds = (membersRes.data || []).map((r) => r.user_id);
      const allIds = (allRes.data || []).map((r) => r.user_id);

      let memberProfiles: Profile[] = [];
      let allProfiles: Profile[] = [];
      if (memberIds.length > 0) {
        const { data: mp } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", memberIds)
          .order("last_name");
        memberProfiles = (mp || []) as Profile[];
      }
      if (allIds.length > 0) {
        const { data: ap } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", allIds)
          .order("last_name");
        allProfiles = (ap || []) as Profile[];
      }

      setMembers(memberProfiles);
      setAllProfiles(allProfiles);
      if (myRow.data) {
        setNotifsEnabled(myRow.data.notifications_enabled);
      }
      setLoading(false);
    }
    load();
    return () => { ignore = true; };
  }, [open, channel, myUserId, teamId]);

  async function toggleNotifications(enabled: boolean) {
    if (!channel) return;
    setNotifsEnabled(enabled);
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_members")
      .update({ notifications_enabled: enabled })
      .eq("channel_id", channel.id)
      .eq("user_id", myUserId);
    if (error) {
      toast.error("Erreur lors de la mise à jour");
      setNotifsEnabled(!enabled);
      return;
    }
  }

  async function rename() {
    if (!channel || !renameValue.trim() || renameValue.trim() === channel.name) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_channels")
      .update({ name: renameValue.trim() })
      .eq("id", channel.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur lors du renommage");
      return;
    }
    toast.success("Canal renommé");
    onRenamed(renameValue.trim());
  }

  async function addMembers() {
    if (!channel || selectedToAdd.length === 0) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_members")
      .upsert(
        selectedToAdd.map((userId) => ({
          channel_id: channel.id,
          user_id: userId,
          team_id: teamId,
          left_at: null,
        })),
        { onConflict: "channel_id,user_id" }
      );
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de l'ajout des membres");
      return;
    }
    toast.success("Membres ajoutés");
    setSelectedToAdd([]);

    const { data: added } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", selectedToAdd);
    setMembers((prev) => {
      const existing = new Set(prev.map((p) => p.id));
      return [...prev, ...((added as Profile[]) || []).filter((p) => !existing.has(p.id))];
    });
  }

  async function leave() {
    if (!channel) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_members")
      .update({ left_at: new Date().toISOString() })
      .eq("channel_id", channel.id)
      .eq("user_id", myUserId);
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de la sortie du canal");
      return;
    }
    toast.success("Vous avez quitté le canal");
    onLeft();
  }

  async function deleteChannel() {
    if (!channel) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("chat_channels")
      .delete()
      .eq("id", channel.id);
    setSaving(false);
    if (error) {
      toast.error("Erreur lors de la suppression");
      return;
    }
    toast.success("Canal supprimé");
    onDeleted();
  }

  const availableToAdd = allProfiles.filter((p) => !members.some((m) => m.id === p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paramètres du canal</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-royal)]" />
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            <div>
              <p className="text-sm font-medium">{channel?.name}</p>
              {isDefault && (
                <p className="text-xs text-muted-foreground">
                  Canal système de l&apos;équipe
                </p>
              )}
            </div>

            {/* Membres */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                Membres ({members.length})
              </div>
              <ScrollArea className="h-40 rounded-md border p-2">
                <div className="space-y-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                      <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                        {m.first_name?.[0]}{m.last_name?.[0]}
                      </span>
                      <span>{m.first_name} {m.last_name}</span>
                      {m.id === myUserId && (
                        <span className="ml-auto text-[10px] text-muted-foreground">vous</span>
                      )}
                    </div>
                  ))}
                  {members.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucun membre
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Notifications */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    {isDefault
                      ? "Notifications obligatoires sur ce canal"
                      : "Recevoir une notification pour chaque message"}
                  </p>
                </div>
              </div>
              <Switch
                checked={notifsEnabled}
                disabled={isDefault}
                onCheckedChange={toggleNotifications}
              />
            </div>

            {/* Actions créateur */}
            {isCreator && (
              <>
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                    Renommer le canal
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      placeholder="Nom du canal"
                    />
                    <Button
                      variant="outline"
                      onClick={rename}
                      disabled={saving || !renameValue.trim() || renameValue.trim() === channel?.name}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Renommer"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    Ajouter des membres
                  </div>
                  <ScrollArea className="h-32 rounded-md border p-2">
                    <div className="space-y-1">
                      {availableToAdd.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedToAdd.includes(p.id)}
                            onCheckedChange={(checked) =>
                              setSelectedToAdd(
                                checked
                                  ? [...selectedToAdd, p.id]
                                  : selectedToAdd.filter((id) => id !== p.id)
                              )
                            }
                          />
                          <span className="text-sm">
                            {p.first_name} {p.last_name}
                          </span>
                        </label>
                      ))}
                      {availableToAdd.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Tous les membres de l&apos;équipe sont déjà dans le canal
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                  <Button
                    variant="outline"
                    className="w-full border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
                    onClick={addMembers}
                    disabled={selectedToAdd.length === 0 || saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Ajouter
                  </Button>
                </div>

                <div className="border-t pt-3">
                  <Button
                    variant="outline"
                    className="w-full border-red-300 text-red-600 hover:bg-red-50"
                    onClick={deleteChannel}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {confirmDelete ? "Confirmer la suppression" : "Supprimer le canal"}
                  </Button>
                </div>
              </>
            )}

            {/* Quitter le canal */}
            {canLeave && (
              <div className="border-t pt-3">
                <Button
                  variant="outline"
                  className="w-full border-red-300 text-red-600 hover:bg-red-50"
                  onClick={leave}
                  disabled={saving}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Quitter le canal
                </Button>
              </div>
            )}

            {/* Rien à gérer pour le canal général d'un non-créateur */}
            {!isCreator && isDefault && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                Le canal général ne peut pas être quitté ni modifié
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
