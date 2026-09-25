"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clapperboard, Loader2, UploadCloud } from "lucide-react";

const ACCEPTED = "video/*";

export function VideoAnalysisUploader({
  teamId,
  onCreated,
}: {
  teamId: string;
  onCreated?: () => void;
}) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const base = f.name.replace(/\.[^.]+$/, "");
      setTitle(base.length > 80 ? base.slice(0, 80) : base);
    }
  }

  async function handleUpload() {
    if (!file || !user || uploading) return;
    setUploading(true);
    setUploadPct(0);
    try {
      // 1. Prépare le bucket privé (idempotent)
      const bucketRes = await authFetch("/api/video-analysis/bucket", { method: "POST" });
      if (!bucketRes.ok) {
        const data = await bucketRes.json();
        throw new Error(data.error || "Impossible de préparer le stockage");
      }

      // 2. Upload dans Supabase Storage (chemin scellé par équipe + user)
      const ext = file.name.split(".").pop() || "mp4";
      const path = `match_videos/${teamId}/${user.id}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;
      const buffer = await file.arrayBuffer();

      const supabase = createClient();
      // upload() n'expose pas de progression partielle : on reste au
      // niveau "préparation / envoi" jusqu'à la fin.
      setUploadPct(5);
      const { error: uploadError } = await supabase.storage
        .from("match_videos")
        .upload(path, buffer, { upsert: true, contentType: file.type || "video/mp4" });
      if (uploadError) throw new Error(uploadError.message);
      setUploadPct(50);

      // 3. Insère la tâche d'analyse (status pending)
      const res = await authFetch("/api/video-analysis/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          title: title.trim() || file.name,
          storagePath: path,
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la création de l'analyse");

      setUploadPct(100);
      toast.success("Vidéo envoyée — l'analyse démarre en arrière-plan");
      setFile(null);
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="border-dashed">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-navy)] text-white">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">Analyser une vidéo de match</p>
            <p className="text-xs text-muted-foreground">
              MP4/WebM · traité en arrière-plan (YOLO + OpenCV) · jusqu&apos;à 1 Go
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="video-file">Vidéo</Label>
          <Input
            id="video-file"
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            disabled={uploading}
            onChange={handlePick}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="video-title">Titre</Label>
          <Input
            id="video-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Match de poule — ECC U14 vs Lens"
            disabled={uploading}
            maxLength={120}
          />
        </div>

        {uploading && (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--color-gold)] transition-all"
                style={{ width: `${uploadPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">Envoi de la vidéo… {uploadPct}%</p>
          </div>
        )}

        <Button
          className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…
            </>
          ) : (
            <>
              <UploadCloud className="mr-2 h-4 w-4" /> Envoyer et analyser
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}