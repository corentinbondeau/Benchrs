"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, Image as ImageIcon, Folder, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { GalleryMedia, Event, Album } from "@/types";

export default function GalleryPage() {
  const { user } = useAuth();
  const { currentTeam } = useTeam();
  const isCoach = user?.profile?.role === "coach";
  const [media, setMedia] = useState<GalleryMedia[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [eventId, setEventId] = useState("Aucun");
  const [albumId, setAlbumId] = useState("Aucun");
  const [events, setEvents] = useState<Event[]>([]);
  const [lightbox, setLightbox] = useState<GalleryMedia | null>(null);
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l'équipe...</p></div>;
  }

  function fetchAlbums() {
    const supabase = createClient();
    supabase
      .from("albums")
      .select("*")
      .eq("team_id", currentTeam!.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setAlbums((data as Album[]) || []));
  }

  function fetchMedia() {
    const supabase = createClient();
    supabase
      .from("gallery_media")
      .select("*")
      .eq("team_id", currentTeam!.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setMedia((data as GalleryMedia[]) || []);
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchAlbums();
    fetchMedia();
  }, []);

  useEffect(() => {
    if (!uploadOpen && !albumOpen) return;
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .eq("team_id", currentTeam!.id)
      .order("event_date", { ascending: false })
      .then(({ data }) => setEvents((data as Event[]) || []));
  }, [uploadOpen, albumOpen]);

  async function handleCreateAlbum() {
    if (!albumTitle.trim()) return;
    setCreating(true);
    const supabase = createClient();
    const { error } = await supabase.from("albums").insert({
      title: albumTitle.trim(),
      description: albumDescription.trim() || null,
      team_id: currentTeam!.id,
      created_by: user!.id,
    });
    setCreating(false);
    if (error) {
      toast.error("Erreur lors de la création");
      return;
    }
    toast.success("Album créé !");
    setAlbumOpen(false);
    setAlbumTitle("");
    setAlbumDescription("");
    fetchAlbums();
  }

  async function handleUpload() {
    if (!files.length || !user) return;
    setUploading(true);

    const supabase = createClient();

    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b) => b.name === "gallery")) {
      const { error: createError } = await supabase.storage.createBucket("gallery", {
        public: true,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ["image/*", "video/*"],
      });
      if (createError) {
        toast.error("Erreur lors de la création du stockage");
        setUploading(false);
        return;
      }
    }

    let uploaded = 0;

    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `gallery/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("gallery")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        toast.error(`Erreur lors de l'upload de ${file.name} : ${uploadError.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("gallery")
        .getPublicUrl(path);

      await supabase.from("gallery_media").insert({
        url: urlData.publicUrl,
        media_type: file.type,
        caption: caption || null,
        event_id: eventId === "Aucun" ? null : eventId,
        album_id: albumId === "Aucun" ? null : albumId,
        uploaded_by: user.id,
        team_id: currentTeam!.id,
      });

      uploaded++;
    }

    if (uploaded > 0) {
      const { data: newMedia } = await supabase
        .from("gallery_media")
        .select("*")
        .eq("team_id", currentTeam!.id)
        .order("created_at", { ascending: false })
        .limit(uploaded);

      if (newMedia?.length) {
        setMedia((prev) => [...(newMedia as GalleryMedia[]), ...prev]);
      }

      toast.success(`${uploaded} fichier${uploaded > 1 ? "s" : ""} ajouté${uploaded > 1 ? "s" : ""} avec succès`);
    }

    setUploadOpen(false);
    setFiles([]);
    setCaption("");
    setEventId("Aucun");
    setAlbumId("Aucun");
    setUploading(false);
  }

  const albumMedia = selectedAlbum
    ? media.filter((m) => m.album_id === selectedAlbum.id)
    : [];

  function getAlbumCover(album: Album): string | null {
    const first = media.find((m) => m.album_id === album.id);
    return first?.url || null;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Galerie</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (selectedAlbum) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedAlbum(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Albums
          </Button>
        </div>
        <div>
          <h2 className="text-2xl font-bold">{selectedAlbum.title}</h2>
          {selectedAlbum.description && (
            <p className="text-muted-foreground mt-1">{selectedAlbum.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{albumMedia.length} photo{albumMedia.length !== 1 ? "s" : ""}</p>
        </div>
        {albumMedia.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            <div className="text-center">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">Aucune photo dans cet album</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {albumMedia.map((item) => (
              <Card key={item.id} className="overflow-hidden cursor-pointer" onClick={() => setLightbox(item)}>
                <div className="aspect-square bg-muted">
                  <img src={item.url} alt={item.caption || ""} className="w-full h-full object-cover" />
                </div>
                {item.caption && (
                  <CardContent className="p-2">
                    <p className="text-xs text-muted-foreground truncate">{item.caption}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Galerie</h2>
          <p className="text-muted-foreground mt-1">Photos et vidéos de l&apos;équipe</p>
        </div>
        <div className="flex gap-2">
          {user && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger render={<Button className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" />}>
                <Upload className="h-4 w-4 mr-1" />
                Ajouter
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Ajouter un média</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="file">Photos / Vidéos</Label>
                    <Input id="file" type="file" accept="image/*,video/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                    {files.length > 0 && <p className="text-xs text-muted-foreground">{files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="caption">Légende (optionnel)</Label>
                    <Input id="caption" placeholder="Description..." value={caption} onChange={(e) => setCaption(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Album (optionnel)</Label>
                    <Select value={albumId} onValueChange={(v) => setAlbumId(v ?? "Aucun")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Aucun album" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Aucun">Aucun</SelectItem>
                        {albums.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Événement (optionnel)</Label>
                    <Select value={eventId} onValueChange={(v) => setEventId(v ?? "Aucun")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Aucun événement" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Aucun">Aucun</SelectItem>
                        {events.map((evt) => (
                          <SelectItem key={evt.id} value={evt.id}>{evt.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={handleUpload} disabled={!files.length || uploading}>
                    <Upload className="h-4 w-4 mr-1" />
                    {uploading ? "Envoi en cours..." : "Envoyer"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {isCoach && (
            <Dialog open={albumOpen} onOpenChange={setAlbumOpen}>
              <DialogTrigger render={<Button variant="outline" className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10" />}>
                <Folder className="h-4 w-4 mr-1" />
                Album
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Créer un album</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Titre *</Label>
                    <Input value={albumTitle} onChange={(e) => setAlbumTitle(e.target.value)} placeholder="Ex: Match du 15 mars" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optionnel)</Label>
                    <Textarea value={albumDescription} onChange={(e) => setAlbumDescription(e.target.value)} placeholder="Description de l'album..." rows={3} />
                  </div>
                  <Button className="w-full" onClick={handleCreateAlbum} disabled={!albumTitle.trim() || creating}>
                    {creating ? "Création..." : "Créer l'album"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Albums */}
      {albums.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Albums</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {albums.map((album) => {
              const cover = getAlbumCover(album);
              const count = media.filter((m) => m.album_id === album.id).length;
              return (
                <Card key={album.id} className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setSelectedAlbum(album)}>
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    {cover ? (
                      <img src={cover} alt={album.title} className="w-full h-full object-cover" />
                    ) : (
                      <Folder className="h-10 w-10 text-muted-foreground/40" />
                    )}
                  </div>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate">{album.title}</p>
                    <p className="text-xs text-muted-foreground">{count} photo{count !== 1 ? "s" : ""}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* All Media */}
      <div>
        <h3 className="text-sm font-semibold mb-3">{albums.length > 0 ? "Toutes les photos" : "Photos"}</h3>
        {media.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            <div className="text-center">
              <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="font-semibold text-lg">Aucun média</h3>
              <p className="text-sm mt-1">Les photos et videos apparaitront ici</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {media.map((item) => {
              const album = albums.find((a) => a.id === item.album_id);
              return (
                <Card key={item.id} className="overflow-hidden cursor-pointer" onClick={() => setLightbox(item)}>
                  <div className="aspect-square bg-muted">
                    <img src={item.url} alt={item.caption || ""} className="w-full h-full object-cover" />
                  </div>
                  <CardContent className="p-2 space-y-0.5">
                    {item.caption && <p className="text-xs text-muted-foreground truncate">{item.caption}</p>}
                    {album && <p className="text-[10px] text-muted-foreground/60 truncate">{album.title}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightbox(null)}>
        <DialogContent className="sm:max-w-2xl p-0 bg-black border-0">
          {lightbox && (
            <img src={lightbox.url} alt={lightbox.caption || ""} className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}