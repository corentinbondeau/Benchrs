"use client";

import { useState, useRef } from "react";
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
import { Upload, X, ImagePlus } from "lucide-react";
import type { Event } from "@/types";

interface MediaUploadProps {
  events: Event[];
  onUploaded: () => void;
}

export function MediaUpload({ events, onUploaded }: MediaUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string>("");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setError("");

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setError("");
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (eventId) fd.append("eventId", eventId);
      if (caption) fd.append("caption", caption);

      const res = await fetch("/api/gallery/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de l'upload");
        setLoading(false);
        return;
      }

      setFile(null);
      setPreview(null);
      setCaption("");
      setEventId("");
      onUploaded();
      setLoading(false);
    } catch {
      setError("Erreur de connexion");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ImagePlus className="h-4 w-4" />
        Ajouter un média
      </div>

      <div
        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileChange}
        />
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="Aperçu"
              className="max-h-40 rounded-md object-cover"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
                setPreview(null);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : file ? (
          <div className="text-center">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} Mo
            </p>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">
            <Upload className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">Cliquez ou glissez un fichier</p>
            <p className="text-xs">Images (JPG, PNG, WebP) ou vidéos (MP4) — max 10 Mo</p>
          </div>
        )}
      </div>

      {file && (
        <>
          <div className="space-y-2">
            <Label>Événement (optionnel)</Label>
            <Select value={eventId} onValueChange={(v) => setEventId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Associer à un événement" />
              </SelectTrigger>
              <SelectContent>
                {events.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {event.title} —{" "}
                    {new Date(event.event_date).toLocaleDateString("fr-FR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">Légende</Label>
            <Input
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Description optionnelle..."
            />
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            onClick={handleUpload}
            disabled={loading}
            className="w-full bg-[var(--gold)] text-[var(--gold-foreground)] hover:bg-[var(--gold)]/90"
          >
            {loading ? "Envoi en cours..." : "Publier"}
          </Button>
        </>
      )}
    </div>
  );
}
