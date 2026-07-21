"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { GalleryMedia, Event } from "@/types";

export default function GalleryPage() {
  const { user } = useAuth();
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [eventId, setEventId] = useState("none");
  const [events, setEvents] = useState<Event[]>([]);
  const [lightbox, setLightbox] = useState<GalleryMedia | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("gallery_media")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setMedia((data as GalleryMedia[]) || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .order("event_date", { ascending: false })
      .then(({ data }) => {
        setEvents((data as Event[]) || []);
      });
  }, [dialogOpen]);

  async function handleUpload() {
    if (!file || !user) return;
    setUploading(true);

    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `gallery/${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("gallery")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error("Erreur lors de l'upload");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("gallery")
      .getPublicUrl(path);

    const { error: insertError } = await supabase.from("gallery_media").insert({
      url: urlData.publicUrl,
      media_type: file.type,
      caption: caption || null,
      event_id: eventId === "none" ? null : eventId,
      uploaded_by: user.id,
    });

    if (insertError) {
      toast.error("Erreur lors de l'enregistrement");
      setUploading(false);
      return;
    }

    const { data: newMedia } = await supabase
      .from("gallery_media")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (newMedia?.[0]) {
      setMedia((prev) => [newMedia[0] as GalleryMedia, ...prev]);
    }

    toast.success("Photo ajoutée avec succès");
    setDialogOpen(false);
    setFile(null);
    setCaption("");
    setEventId("none");
    setUploading(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Galerie</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Galerie</h2>
          <p className="text-muted-foreground mt-1">
            Photos et videos de l&apos;equipe
          </p>
        </div>
        {user && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />
              }
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Ajouter un media</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="file">Photo</Label>
                  <Input
                    id="file"
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setFile(e.target.files?.[0] ?? null)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caption">Légende (optionnel)</Label>
                  <Input
                    id="caption"
                    placeholder="Description..."
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Événement (optionnel)</Label>
                  <Select value={eventId} onValueChange={(v) => setEventId(v ?? "none")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Aucun événement" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Aucun</SelectItem>
                      {events.map((evt) => (
                        <SelectItem key={evt.id} value={evt.id}>
                          {evt.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={handleUpload}
                  disabled={!file || uploading}
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? "Envoi en cours..." : "Envoyer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {media.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
          <div className="text-center">
            <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="font-semibold text-lg">Aucun media</h3>
            <p className="text-sm mt-1">
              Les photos et videos apparaitront ici
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {media.map((item) => (
            <Card
              key={item.id}
              className="overflow-hidden cursor-pointer"
              onClick={() => setLightbox(item)}
            >
              <div className="aspect-square bg-muted">
                <img
                  src={item.url}
                  alt={item.caption || ""}
                  className="w-full h-full object-cover"
                />
              </div>
              {item.caption && (
                <CardContent className="p-2">
                  <p className="text-xs text-muted-foreground truncate">
                    {item.caption}
                  </p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="sm:max-w-2xl p-0 bg-black border-0">
          {lightbox && (
            <img
              src={lightbox.url}
              alt={lightbox.caption || ""}
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
