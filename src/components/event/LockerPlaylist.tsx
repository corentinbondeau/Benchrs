"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Music, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { LockerPlaylistItem } from "@/types";

export function LockerPlaylist({
  eventId,
  teamId,
  isCoach,
  userId,
}: {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  userId: string;
}) {
  const [items, setItems] = useState<LockerPlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("locker_playlist_items")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });
    return (data || []) as LockerPlaylistItem[];
  }, [eventId]);

  useEffect(() => {
    loadData().then((res) => {
      setItems(res);
      setLoading(false);
    });
  }, [loadData]);

  async function addItem() {
    if (!title.trim() || !url.trim()) {
      toast.error("Titre et lien sont requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("locker_playlist_items")
        .insert({ event_id: eventId, team_id: teamId, title: title.trim(), url: url.trim(), added_by: userId })
        .select("*")
        .single();
      if (error) throw error;
      setItems((prev) => [...prev, data as LockerPlaylistItem]);
      setTitle("");
      setUrl("");
      setAdding(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("locker_playlist_items").delete().eq("id", id);
    if (error) {
      toast.error(String(error.message));
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Music className="h-4 w-4 text-[var(--color-gold)]" />
            Playlist de vestiaire
          </p>
          {!adding && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
              <Plus className="h-3 w-3 mr-1" />
              Ajouter un morceau
            </Button>
          )}
        </div>
        {adding && (
          <div className="space-y-2 rounded-lg bg-muted/40 p-3">
            <div>
              <Label className="text-xs">Titre</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: All the Small Things" className="text-sm h-8 mt-1" />
            </div>
            <div>
              <Label className="text-xs">Lien (YouTube, Spotify...)</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="text-sm h-8 mt-1" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 text-xs flex-1" onClick={addItem} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Ajouter
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Partagez les morceaux à écouter dans le vestiaire avant le match.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium truncate flex items-center gap-1.5 hover:text-[var(--color-royal)]"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {item.title}
                </a>
                {(isCoach || item.added_by === userId) && (
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeItem(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
