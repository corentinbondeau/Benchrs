"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { signList } from "@/lib/storage";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Newspaper,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Send,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import type { ClubPost } from "@/types";

interface PostRow extends Omit<ClubPost, "author" | "team"> {
  author?: { id: string; first_name: string; last_name: string } | null;
  team?: { id: string; name: string; color_primary: string | null } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

export default function ClubFeedPage() {
  const { user } = useAuth();
  const { currentTeam, clubMemberships, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const clubId = currentTeam?.club_id || clubMemberships?.[0]?.club_id || null;

  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fallbackTeamId, setFallbackTeamId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    if (!clubId) return null;
    const supabase = createClient();
    const { data } = await supabase
      .from("club_posts")
      .select(
        "id, club_id, team_id, author_id, content, media_url, storage_path, media_type, created_at, author:profiles(id, first_name, last_name), team:teams(id, name, color_primary)"
      )
      .eq("club_id", clubId)
      .order("created_at", { ascending: false })
      .limit(50);
    const rows = (data || []) as unknown as PostRow[];
    return signList(supabase, "club_feed", rows, (p) => ({
      path: p.storage_path || p.media_url,
      urlField: "media_url",
    }));
  }, [clubId]);

  useEffect(() => {
    loadPosts().then((rows) => {
      if (rows) {
        setPosts(rows);
        setLoading(false);
      }
    });
  }, [loadPosts]);

  useEffect(() => {
    if (!clubId) return;
    const supabase = createClient();
    supabase
      .from("teams")
      .select("id")
      .eq("club_id", clubId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setFallbackTeamId((data as { id: string } | null)?.id ?? null);
      });
  }, [clubId]);

  if (!clubId) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 pb-20 md:pb-0">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Newspaper className="h-6 w-6" />
          Fil du club
        </h1>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Ce club n&apos;est lié à aucune entité. Le fil d&apos;actualité nécessite un club.
          </CardContent>
        </Card>
      </div>
    );
  }

  const teamId = currentTeam?.id && currentTeam.club_id === clubId
    ? currentTeam.id
    : fallbackTeamId;

  async function handlePost() {
    if (!clubId || !teamId) {
      toast.error("Aucune équipe disponible pour publier");
      return;
    }
    if (!content.trim() && !file) {
      toast.error("Écris un message ou ajoute une photo");
      return;
    }
    setPosting(true);
    try {
      const supabase = createClient();
      const postId = crypto.randomUUID();

      let mediaUrl: string | null = null;
      let storagePath: string | null = null;
      let mediaType: string | null = null;

      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        storagePath = `club_feed/${clubId}/${postId}.${ext}`;
        const buffer = await file.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from("club_feed")
          .upload(storagePath, buffer, { upsert: true, contentType: file.type });
        if (uploadError) throw new Error("Upload impossible");
        mediaUrl = storagePath;
        mediaType = file.type.startsWith("video/") ? "video" : "image";
      }

      const { error } = await supabase.from("club_posts").insert({
        id: postId,
        club_id: clubId,
        team_id: teamId,
        author_id: user?.id ?? null,
        content: content.trim(),
        media_url: mediaUrl,
        storage_path: storagePath,
        media_type: mediaType,
      });
      if (error) throw error;

      setContent("");
      setFile(null);
      toast.success("Publication en ligne !");
      const rows = await loadPosts();
      if (rows) setPosts(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la publication");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(post: PostRow) {
    setDeletingId(post.id);
    try {
      const supabase = createClient();
      if (post.storage_path) {
        await supabase.storage.from("club_feed").remove([post.storage_path]);
      }
      const { error } = await supabase.from("club_posts").delete().eq("id", post.id);
      if (error) throw error;
      toast.success("Publication supprimée");
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (e) {
      toast.error(String(e));
    } finally {
      setDeletingId(null);
    }
  }

  const canDelete = (post: PostRow) =>
    isCoach || post.author_id === user?.id;

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-20 md:pb-0">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <Newspaper className="h-6 w-6" />
          Fil du club
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Partagez des photos, résultats et actualités avec toutes les équipes.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Quoi de neuf au club ?"
            rows={2}
          />
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              {file ? file.name.slice(0, 24) : "Photo / vidéo"}
              <input
                type="file"
                accept="image/*,video/mp4,video/quicktime"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              onClick={handlePost}
              disabled={posting || !teamId}
              className="ml-auto bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Publier
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Chargement...</CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">Aucune publication pour le moment.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="pt-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-royal)] text-white text-xs font-bold">
                    {post.author?.first_name?.[0]}
                    {post.author?.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">
                      {post.author?.first_name} {post.author?.last_name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: post.team?.color_primary || "#94a3b8" }}
                      />
                      <span className="truncate">{post.team?.name}</span>
                      <span>· {timeAgo(post.created_at)}</span>
                    </div>
                  </div>
                  {canDelete(post) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="ml-auto h-7 w-7 text-muted-foreground hover:text-red-600"
                      onClick={() => handleDelete(post)}
                      disabled={deletingId === post.id}
                    >
                      {deletingId === post.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>

                {post.content && <p className="text-sm whitespace-pre-wrap">{post.content}</p>}

                {post.media_url && post.media_type === "video" ? (
                  <video
                    src={post.media_url}
                    controls
                    className="w-full rounded-lg aspect-video bg-black object-contain"
                  />
                ) : post.media_url ? (
                  <img
                    src={post.media_url}
                    alt="Publication du club"
                    className="w-full rounded-lg object-cover max-h-96"
                  />
                ) : null}

                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {post.team?.name || "Club"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
