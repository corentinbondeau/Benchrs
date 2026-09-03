"use client";

import { useEffect, useState, useCallback } from "react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { signList } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { logActivity } from "@/lib/activity";
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
import { Plus, Upload, Image as ImageIcon, Folder, ArrowLeft, Trash2, Download } from "lucide-react";
import { compressImage } from "@/lib/compressImage";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import type { GalleryMedia, Event, Album } from "@/types";

export default function GalleryPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
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
  const [lightboxAlbum, setLightboxAlbum] = useState("Aucun");
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumDescription, setAlbumDescription] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAlbum, setBulkAlbum] = useState("Aucun");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 30;

  const fetchAlbums = useCallback(() => {
    if (!currentTeam) return;
    const supabase = createClient();
    supabase
      .from("albums")
      .select("*")
      .eq("team_id", currentTeam.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setAlbums((data as Album[]) || []));
  }, [currentTeam]);

  const fetchMediaPage = useCallback(async (pageIndex: number) => {
    if (!currentTeam) return;
    const supabase = createClient();
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("gallery_media")
      .select("*")
      .eq("team_id", currentTeam.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    const rows = (data as GalleryMedia[]) || [];
    const signed = await signList(supabase, "gallery", rows, (m) => ({
      path: m.storage_path || m.url,
      urlField: "url",
    }));
    if (pageIndex === 0) {
      setMedia(signed);
      setHasMore(rows.length >= PAGE_SIZE);
    } else {
      setMedia((prev) => [...prev, ...signed]);
      if (rows.length < PAGE_SIZE) setHasMore(false);
    }
    setLoading(false);
  }, [currentTeam]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchMediaPage(nextPage);
  }, [hasMore, loading, page, fetchMediaPage]);

  const sentinelRef = useInfiniteScroll(handleLoadMore, hasMore, loading);

  useEffect(() => {
    if (!currentTeam) return;
    fetchAlbums();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMediaPage(0);
  }, [currentTeam, fetchAlbums, fetchMediaPage]);

  useEffect(() => {
    if (!uploadOpen && !albumOpen || !currentTeam) return;
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .eq("team_id", currentTeam.id)
      .order("event_date", { ascending: false })
      .then(({ data }) => setEvents((data as Event[]) || []));
  }, [uploadOpen, albumOpen, currentTeam]);

  useEffect(() => {
    if (!media.length || !currentTeam) return;
    const eventIds = [...new Set(media.map((m) => m.event_id).filter(Boolean))] as string[];
    if (!eventIds.length) return;
    const supabase = createClient();
    supabase
      .from("events")
      .select("*")
      .in("id", eventIds)
      .order("event_date", { ascending: false })
      .then(({ data }) => { setEvents((data as Event[]) || []); });
  }, [media, currentTeam]);

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement de l&apos;équipe...</p></div>;
  }

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
      toast.error(`Erreur lors de la création : ${error.message}`);
      return;
    }
    toast.success("Album créé !");
    setAlbumOpen(false);
    setAlbumTitle("");
    setAlbumDescription("");
    fetchAlbums();
  }

  async function handleDeleteMedia(mediaId: string, storagePath: string | null) {
    if (!confirm("Supprimer cette photo ?")) return;
    const res = await authFetch("/api/gallery/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    const data = await res.json();
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setMedia((prev) => prev.filter((m) => m.id !== mediaId));
    toast.success("Photo supprimée");
  }

  async function handleDeleteAlbum(albumId: string) {
    if (!confirm("Supprimer cet album ? Les photos ne seront pas supprimées.")) return;
    const res = await authFetch("/api/albums/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId }),
    });
    const data = await res.json();
    if (data.error) {
      toast.error(data.error);
      return;
    }
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    toast.success("Album supprimé");
  }

  async function handleDownload(url: string, filename: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      toast.error("Erreur lors du téléchargement");
    }
  }

  async function handleUpload() {
    if (!files.length || !user) return;
    setUploading(true);

    const supabase = createClient();

    const res = await authFetch("/api/storage/gallery-bucket", { method: "POST" });
    const bucketData = await res.json();
    if (bucketData.error) {
      toast.error("Erreur lors de la création du stockage");
      setUploading(false);
      return;
    }

    let uploaded = 0;

    for (const file of files) {
      if (!file.size) {
        toast.error(`${file.name} est vide`);
        continue;
      }

      // Compression des images avant upload (sauf vidéos)
      const isImage = file.type.startsWith("image/");
      let uploadBlob: Blob = file;
      let uploadContentType = file.type;
      let uploadExt = file.name.split(".").pop();
      if (isImage) {
        uploadBlob = await compressImage(file);
        uploadContentType = "image/webp";
        uploadExt = "webp";
      }

      const path = `gallery/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${uploadExt}`;
      const buffer = await uploadBlob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("gallery")
        .upload(path, buffer, { upsert: true, contentType: uploadContentType });

      if (uploadError) {
        toast.error(`Erreur lors de l'upload de ${file.name} : ${uploadError.message}`);
        continue;
      }

      await supabase.from("gallery_media").insert({
        url: path,
        storage_path: path,
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
        const signed = await signList(supabase, "gallery", newMedia as GalleryMedia[], (m) => ({
          path: m.storage_path || m.url,
          urlField: "url",
        }));
        setMedia((prev) => [...signed, ...prev]);
      }

      toast.success(`${uploaded} fichier${uploaded > 1 ? "s" : ""} ajouté${uploaded > 1 ? "s" : ""} avec succès`);

      logActivity({
        teamId: currentTeam!.id,
        userId: user!.id,
        actionType: "gallery.upload",
        description: `${uploaded} média${uploaded > 1 ? "s" : ""} ajouté${uploaded > 1 ? "s" : ""}`,
        metadata: { count: uploaded },
      }).catch(() => {});
    }

    setUploadOpen(false);
    setFiles([]);
    setCaption("");
    setEventId("Aucun");
    setAlbumId("Aucun");
    setUploading(false);
  }

  const eventsWithPhotos = events.filter((e) =>
    media.some((m) => m.event_id === e.id)
  );

  const filteredMedia = media.filter((m) => {
    if (selectedAlbum && m.album_id !== selectedAlbum.id) return false;
    if (selectedEvent && m.event_id !== selectedEvent.id) return false;
    return true;
  });

  const albumMedia = filteredMedia;

  function getAlbumCover(album: Album): string | null {
    const first = media.find((m) => m.album_id === album.id);
    return first?.url || null;
  }

  if (loading) {
    return (
      <div className="section-gap">
        <h1 className="text-2xl font-bold">Galerie</h1>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (selectedAlbum) {
    return (
      <div className="section-gap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedAlbum(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Albums
          </Button>
        </div>
        <div>
          <h1 className="text-2xl font-bold">{selectedAlbum.title}</h1>
          {selectedAlbum.description && (
            <p className="text-muted-foreground mt-1">{selectedAlbum.description}</p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{albumMedia.length} photo{albumMedia.length !== 1 ? "s" : ""}</p>
            {albumMedia.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  for (const item of albumMedia) {
                    await handleDownload(item.url, item.storage_path?.split("/").pop() || `photo-${item.id}`);
                  }
                  toast.success("Téléchargement terminé");
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                Tout télécharger
              </Button>
            )}
          </div>
        </div>
        {eventsWithPhotos.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedEvent(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                !selectedEvent
                  ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              Toutes les photos
            </button>
            {eventsWithPhotos.map((evt) => (
              <button
                key={evt.id}
                onClick={() => setSelectedEvent(selectedEvent?.id === evt.id ? null : evt)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedEvent?.id === evt.id
                    ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span className="truncate max-w-[140px] inline-block">{evt.title}</span>
                {evt.event_date && (
                  <span className="ml-1.5 opacity-70">
                    {new Date(evt.event_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {albumMedia.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title={selectedEvent ? "Aucune photo pour cet événement" : "Aucune photo dans cet album"}
            description={selectedEvent ? "Changez de filtre ou réinitialisez." : "Ajoutez des photos à cet album."}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {albumMedia.map((item) => (
              <Card key={item.id} className="overflow-hidden cursor-pointer group relative" onClick={() => {
                if (selecting) {
                  setSelectedIds((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; });
                } else {
                  setLightbox(item); setLightboxAlbum(item.album_id || "Aucun");
                }
              }}>
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {item.media_type?.startsWith("video/") ? (
  <video src={item.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
) : (
  <Image src={item.url} alt={item.caption || ""} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" loading="lazy" decoding="async" />
)}
                  {selecting && (
                    <div className={`absolute inset-0 flex items-start justify-end p-2 ${selectedIds.has(item.id) ? "bg-black/30" : ""}`}>
                      <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${selectedIds.has(item.id) ? "bg-[var(--color-gold)] border-[var(--color-gold)]" : "border-white bg-white/30"}`}>
                        {selectedIds.has(item.id) && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3 text-[var(--color-navy)]"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>
                    </div>
                  )}
                </div>
                {item.caption && (
                  <CardContent className="p-2">
                    <p className="text-xs text-muted-foreground truncate">{item.caption}</p>
                  </CardContent>
                )}
                {isCoach && !selecting && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); handleDeleteMedia(item.id, item.storage_path); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="section-gap">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Galerie</h1>
          <p className="text-sm text-muted-foreground mt-1">Photos et vidéos de l&apos;équipe</p>
        </div>
        <div className="flex gap-2">
          {user && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger render={<Button className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold" />}>
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
                        <SelectValue placeholder="Aucun album">
                          {(v) => v === "Aucun" || !v ? "Aucun album" : albums.find((a) => a.id === v)?.title || v}
                        </SelectValue>
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
                        <SelectValue placeholder="Aucun événement">
                          {(v) => v === "Aucun" || !v ? "Aucun événement" : events.find((e) => e.id === v)?.title || v}
                        </SelectValue>
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
          {isCoach && (
            <Button
              variant={selecting ? "default" : "outline"}
              className={selecting
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"}
              onClick={() => { setSelecting(!selecting); setSelectedIds(new Set()); }}
            >
              {selecting ? "Annuler" : "Sélectionner"}
            </Button>
          )}
        </div>
      </div>

      {selecting && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
          <span className="text-sm font-medium">{selectedIds.size} sélectionné{selectedIds.size !== 1 ? "s" : ""}</span>
          <Select value={bulkAlbum} onValueChange={(v) => setBulkAlbum(v ?? "Aucun")}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Album">
                {(v) => v === "Aucun" || !v ? "Aucun album" : albums.find((a) => a.id === v)?.title || v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Aucun">Aucun album</SelectItem>
              {albums.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedIds.size}
            onClick={async () => {
              for (const id of selectedIds) {
                const item = media.find((m) => m.id === id);
                if (item) await handleDownload(item.url, item.storage_path?.split("/").pop() || `photo-${id}`);
              }
              setSelectedIds(new Set());
              setSelecting(false);
            }}
            variant="outline"
            className="border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10"
          >
            <Download className="h-4 w-4 mr-1" />
            Télécharger
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!selectedIds.size}
            onClick={async () => {
              if (!confirm(`Supprimer ${selectedIds.size} photo${selectedIds.size !== 1 ? "s" : ""} ?`)) return;
              const res = await authFetch("/api/gallery/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mediaIds: Array.from(selectedIds) }),
              });
              const data = await res.json();
              if (data.error) { toast.error(data.error); return; }
              setMedia((prev) => prev.filter((m) => !selectedIds.has(m.id)));
              toast.success(`${selectedIds.size} photo${selectedIds.size !== 1 ? "s" : ""} supprimée${selectedIds.size !== 1 ? "s" : ""}`);
              setSelectedIds(new Set());
              setSelecting(false);
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Supprimer
          </Button>
          <Button
            size="sm"
            disabled={!selectedIds.size}
            onClick={async () => {
              for (const id of selectedIds) {
                await authFetch("/api/gallery/set-album", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mediaId: id, albumId: bulkAlbum === "Aucun" ? null : bulkAlbum }),
                });
              }
              setMedia((prev) => prev.map((m) =>
                selectedIds.has(m.id) ? { ...m, album_id: bulkAlbum === "Aucun" ? null : bulkAlbum } : m
              ));
              toast.success(`${selectedIds.size} photo${selectedIds.size !== 1 ? "s" : ""} mise${selectedIds.size !== 1 ? "s" : ""} à jour`);
              setSelectedIds(new Set());
              setSelecting(false);
            }}
            className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
          >
            Appliquer
          </Button>
        </div>
      )}

      {/* Albums */}
      {albums.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Albums</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {albums.map((album) => {
              const cover = getAlbumCover(album);
              const count = media.filter((m) => m.album_id === album.id).length;
              return (
                <Card key={album.id} className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors group relative" onClick={() => setSelectedAlbum(album)}>
                  <div className="aspect-video bg-muted relative flex items-center justify-center overflow-hidden">
                    {cover ? (
                      <Image src={cover} alt={album.title} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <Folder className="h-10 w-10 text-muted-foreground/40" />
                    )}
                  </div>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate">{album.title}</p>
                    <p className="text-xs text-muted-foreground">{count} photo{count !== 1 ? "s" : ""}</p>
                  </CardContent>
                  {isCoach && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAlbum(album.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters & All Media */}
      <div>
        {eventsWithPhotos.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <button
                onClick={() => setSelectedEvent(null)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  !selectedEvent
                    ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Toutes les photos
              </button>
              {eventsWithPhotos.map((evt) => (
                <button
                  key={evt.id}
                  onClick={() => setSelectedEvent(selectedEvent?.id === evt.id ? null : evt)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedEvent?.id === evt.id
                      ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <span className="truncate max-w-[140px] inline-block">{evt.title}</span>
                  {evt.event_date && (
                    <span className="ml-1.5 opacity-70">
                      {new Date(evt.event_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {selectedAlbum && selectedEvent && (
              <button
                onClick={() => { setSelectedAlbum(null); setSelectedEvent(null); }}
                className="mt-2 text-xs text-[var(--color-gold)] hover:underline"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}
        <h3 className="text-sm font-semibold mb-3">
          {albums.length > 0 ? "Toutes les photos" : "Photos"}
          {filteredMedia.length !== media.length && (
            <span className="ml-2 font-normal text-muted-foreground">
              ({filteredMedia.length} sur {media.length})
            </span>
          )}
        </h3>
        {filteredMedia.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title={selectedEvent ? "Aucune photo pour cet événement" : "Aucun média"}
            description={selectedEvent ? "Changez de filtre ou réinitialisez." : "Les photos et vidéos apparaîtront ici."}
            action={!selectedEvent && user ? { label: "Ajouter une photo", onClick: () => setUploadOpen(true) } : undefined}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredMedia.map((item) => {
              const album = albums.find((a) => a.id === item.album_id);
              return (
              <Card key={item.id} className="overflow-hidden cursor-pointer group relative" onClick={() => {
                if (selecting) {
                  setSelectedIds((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; });
                } else {
                  setLightbox(item); setLightboxAlbum(item.album_id || "Aucun");
                }
              }}>
                  <div className="aspect-square bg-muted relative overflow-hidden">
                    {item.media_type?.startsWith("video/") ? (
  <video src={item.url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
) : (
  <Image src={item.url} alt={item.caption || ""} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover" loading="lazy" decoding="async" />
)}
                    {selecting && (
                      <div className={`absolute inset-0 flex items-start justify-end p-2 ${selectedIds.has(item.id) ? "bg-black/30" : ""}`}>
                        <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${selectedIds.has(item.id) ? "bg-[var(--color-gold)] border-[var(--color-gold)]" : "border-white bg-white/30"}`}>
                          {selectedIds.has(item.id) && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3 text-[var(--color-navy)]"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                      </div>
                    )}
                  </div>
                  <CardContent className="p-2 space-y-0.5">
                    {item.caption && <p className="text-xs text-muted-foreground truncate">{item.caption}</p>}
                    {album && <p className="text-[10px] text-muted-foreground/60 truncate">{album.title}</p>}
                  </CardContent>
                  {isCoach && !selecting && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handleDeleteMedia(item.id, item.storage_path); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
        {/* Sentinel infinite scroll */}
        <div ref={sentinelRef} className="h-4" />
      </div>

      <Dialog open={!!lightbox} onOpenChange={(open) => {
        if (open && lightbox) {
          setLightboxAlbum(lightbox.album_id || "Aucun");
        } else {
          setLightbox(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl p-0 bg-black border-0">
          {lightbox && (
            lightbox.media_type?.startsWith("video/") ? (
              <video src={lightbox.url} controls className="w-full max-h-[80vh] rounded-lg" autoPlay playsInline preload="metadata" />
            ) : (
              <img src={lightbox.url} alt={lightbox.caption || "Photo de la galerie"} className="w-full h-auto max-h-[80vh] object-contain rounded-lg" decoding="async" />
            )
          )}
          {lightbox && (
            <div className="flex items-center justify-center p-2 bg-black/60" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="ghost"
                className="text-white/80 hover:text-white hover:bg-white/10"
                onClick={() => handleDownload(lightbox.url, lightbox.storage_path?.split("/").pop() || `photo-${lightbox.id}`)}
              >
                <Download className="h-4 w-4 mr-1" />
                Télécharger
              </Button>
            </div>
          )}
          {lightbox && isCoach && (
            <div className="flex items-center gap-2 p-3 bg-black/80 rounded-b-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <Select value={lightboxAlbum} onValueChange={(v) => setLightboxAlbum(v ?? "Aucun")}>
                <SelectTrigger className="flex-1 bg-white/10 text-white border-white/20">
                  <SelectValue placeholder="Album">
                    {(v) => v === "Aucun" || !v ? "Aucun album" : albums.find((a) => a.id === v)?.title || v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aucun">Aucun album</SelectItem>
                  {albums.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold shrink-0"
                onClick={async () => {
                  const res = await authFetch("/api/gallery/set-album", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mediaId: lightbox.id, albumId: lightboxAlbum === "Aucun" ? null : lightboxAlbum }),
                  });
                  const data = await res.json();
                  if (data.error) {
                    toast.error(data.error);
                    return;
                  }
                  setMedia((prev) => prev.map((m) =>
                    m.id === lightbox.id ? { ...m, album_id: lightboxAlbum === "Aucun" ? null : lightboxAlbum } : m
                  ));
                  toast.success("Album mis à jour");
                  setLightbox(null);
                }}
              >
                Enregistrer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}