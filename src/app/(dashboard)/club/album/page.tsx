"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Camera, Upload, MessageCircle, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signedStorageUrl } from "@/lib/storage";

interface Photo {
  id: string;
  team_id: string | null;
  uploaded_by: string;
  caption: string | null;
  taken_at: string | null;
  storage_path: string;
  created_at: string;
  url: string | null;
  comments: number;
}
interface PhotoComment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso)
  );
}

export default function ClubAlbumPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadTeam, setUploadTeam] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const [viewing, setViewing] = useState<Photo | null>(null);
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editCaption, setEditCaption] = useState("");

  const load = useCallback(async (cid: string) => {
    const { data: teamsData } = await supabaseRef.current.from("teams").select("id, name").eq("club_id", cid);
    const teamRows = ((teamsData || []) as { id: string; name: string }[]).map((t) => ({ id: t.id, name: t.name }));

    const { data: photosData } = await supabaseRef.current
      .from("club_album_photos")
      .select("*")
      .eq("club_id", cid)
      .order("created_at", { ascending: false });
    let rows = ((photosData || []) as Record<string, unknown>[]).map((p) => ({
      id: p.id as string,
      team_id: (p.team_id as string | null) ?? null,
      uploaded_by: p.uploaded_by as string,
      caption: (p.caption as string | null) ?? null,
      taken_at: (p.taken_at as string | null) ?? null,
      storage_path: p.storage_path as string,
      created_at: p.created_at as string,
      url: null as string | null,
      comments: 0,
    }));

    let namesMap: Record<string, string> = {};
    let counts = new Map<string, number>();
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const { data: commentsData } = await supabaseRef.current
        .from("club_album_comments")
        .select("photo_id")
        .in("photo_id", ids);
      counts = new Map<string, number>();
      for (const c of commentsData || []) {
        const pid = (c as { photo_id: string }).photo_id;
        counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
      const userIds = [...new Set(rows.map((r) => r.uploaded_by))];
      const { data: profiles } = await supabaseRef.current
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);
      namesMap = Object.fromEntries(
        ((profiles || []) as { id: string; first_name: string | null; last_name: string | null }[]).map(
          (p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Membre"]
        )
      );
      rows = await Promise.all(
        rows.map(async (r) => ({
          ...r,
          url: await signedStorageUrl(supabaseRef.current, "club_album", r.storage_path),
          comments: counts.get(r.id) ?? 0,
        }))
      );
    }
    return { photos: rows, teams: teamRows, names: namesMap };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setPhotos(res.photos);
      setTeams(res.teams);
      setNames(res.names);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  async function ensureBucket() {
    const res = await authFetch("/api/storage/club-album-bucket", { method: "POST" });
    if (!res.ok) {
      toast.error("Initialisation du stockage impossible");
      return false;
    }
    return true;
  }

  async function uploadPhoto() {
    if (!clubId || !user) return;
    if (!file) {
      toast.error("Choisissez une photo");
      return;
    }
    setUploading(true);
    try {
      if (!(await ensureBucket())) return;
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `club_album/${clubId}/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabaseRef.current.storage.from("club_album").upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) {
        toast.error("Upload impossible");
        return;
      }
      const { error: insertErr } = await supabaseRef.current.from("club_album_photos").insert({
        club_id: clubId,
        team_id: uploadTeam || null,
        uploaded_by: user.id,
        caption: caption.trim() || null,
        storage_path: path,
      });
      if (insertErr) {
        await supabaseRef.current.storage.from("club_album").remove([path]);
        toast.error("Enregistrement impossible");
        return;
      }
      toast.success("Photo ajoutée à l'album !");
      setUploadOpen(false);
      setFile(null);
      setCaption("");
      setUploadTeam("");
      load(clubId).then((res) => {
        setPhotos(res.photos);
        setTeams(res.teams);
      });
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(p: Photo) {
    if (!clubId) return;
    const { error } = await supabaseRef.current.from("club_album_photos").delete().eq("id", p.id);
    if (error) {
      toast.error("Impossible de supprimer");
      return;
    }
    await supabaseRef.current.storage.from("club_album").remove([p.storage_path]);
    toast.success("Photo supprimée");
    load(clubId).then((res) => {
      setPhotos(res.photos);
      setTeams(res.teams);
    });
  }

  async function openPhoto(p: Photo) {
    setViewing(p);
    setEditCaption(p.caption ?? "");
    setNewComment("");
    const { data } = await supabaseRef.current
      .from("club_album_comments")
      .select("id, user_id, content, created_at")
      .eq("photo_id", p.id)
      .order("created_at", { ascending: true });
    setComments(((data || []) as Record<string, unknown>[]).map((c) => ({
      id: c.id as string,
      user_id: c.user_id as string,
      content: c.content as string,
      created_at: c.created_at as string,
    })));
  }

  async function saveCaption() {
    if (!viewing) return;
    const { error } = await supabaseRef.current
      .from("club_album_photos")
      .update({ caption: editCaption.trim() || null })
      .eq("id", viewing.id);
    if (error) {
      toast.error("Impossible d'enregistrer la légende");
      return;
    }
    setViewing({ ...viewing, caption: editCaption.trim() || null });
    if (clubId) {
      load(clubId).then((res) => setPhotos(res.photos));
    }
  }

  async function addComment() {
    if (!viewing || !user) return;
    const clean = newComment.trim();
    if (!clean) return;
    const { data, error } = await supabaseRef.current
      .from("club_album_comments")
      .insert({ photo_id: viewing.id, user_id: user.id, content: clean })
      .select("id, user_id, content, created_at")
      .maybeSingle();
    if (error) {
      toast.error("Impossible de commenter");
      return;
    }
    setComments([...comments, data as unknown as PhotoComment]);
    setNewComment("");
  }

  async function deleteComment(cid: string) {
    const { error } = await supabaseRef.current.from("club_album_comments").delete().eq("id", cid);
    if (error) {
      toast.error("Impossible de supprimer");
      return;
    }
    setComments(comments.filter((c) => c.id !== cid));
    if (clubId) {
      load(clubId).then((res) => setPhotos(res.photos));
    }
  }

  const visible = photos.filter((p) => teamFilter === "all" || p.team_id === teamFilter);
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? null;
  const canManagePhoto = (p: Photo) => isCommittee || p.uploaded_by === user?.id;

  return (
    <ClubPageShell
      title="Album souvenirs"
      subtitle="Les photos de la saison, postées par les familles"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || pageLoading}
      actions={
        <div className="flex items-center gap-2">
          {teams.length > 1 && (
            <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v ?? "all")}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les équipes</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Poster une photo
          </Button>
        </div>
      }
    >
      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Camera className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Aucune photo pour l&apos;instant. Partagez les moments forts !</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => openPhoto(p)}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
            >
              {p.url ? (
                <img src={p.url} alt={p.caption ?? "Photo"} className="h-full w-full object-cover transition group-hover:scale-105" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition" />
              <div className="absolute inset-x-0 bottom-0 p-2 text-left text-white opacity-0 group-hover:opacity-100 transition text-xs">
                {teamName(p.team_id) || "Club"}
                <span className="flex items-center gap-1 mt-0.5">
                  <MessageCircle className="h-3 w-3" />
                  {p.comments}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Poster une photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Photo</Label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm cursor-pointer">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{file ? file.name : "Choisir une photo"}</span>
                <Input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="space-y-1">
              <Label>Équipe (optionnel)</Label>
              <Select value={uploadTeam} onValueChange={(v) => setUploadTeam(v ?? "")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Tout le club" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tout le club</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Légende (optionnel)</Label>
              <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ex. : Victoire à Camphin !" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)}>
                Annuler
              </Button>
              <Button onClick={uploadPhoto} disabled={uploading}>
                {uploading ? "Envoi…" : "Publier"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {viewing ? teamName(viewing.team_id) || "Album du club" : ""}
              <Badge variant="secondary">{viewing ? names[viewing.uploaded_by] ?? "Membre" : ""}</Badge>
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              {viewing.url ? (
                <img src={viewing.url} alt={viewing.caption ?? "Photo"} className="w-full rounded-lg border max-h-80 object-contain bg-muted" />
              ) : null}
              {canManagePhoto(viewing) ? (
                <div className="space-y-1">
                  <Label>Légende</Label>
                  <div className="flex gap-2">
                    <Input value={editCaption} onChange={(e) => setEditCaption(e.target.value)} placeholder="Ajouter une légende…" />
                    <Button size="sm" onClick={saveCaption}>
                      OK
                    </Button>
                  </div>
                </div>
              ) : (
                viewing.caption && <p className="text-sm text-muted-foreground">{viewing.caption}</p>
              )}

              <div className="rounded-lg border divide-y">
                {comments.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">Aucun commentaire.</p>}
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm">
                        <strong>{names[c.user_id] ?? "Membre"}</strong>{" "}
                        <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
                      </p>
                      <p className="text-sm break-words">{c.content}</p>
                    </div>
                    {(isCommittee || c.user_id === user?.id) && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteComment(c.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Écrire un commentaire…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addComment();
                  }}
                />
                <Button size="sm" onClick={addComment} disabled={!newComment.trim()}>
                  Envoyer
                </Button>
              </div>

              {canManagePhoto(viewing) && (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                    deletePhoto(viewing);
                    setViewing(null);
                  }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Supprimer
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ClubPageShell>
  );
}