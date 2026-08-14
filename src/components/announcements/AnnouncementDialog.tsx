"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Loader2, MessageSquareText, PenLine, Share2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { ANNOUNCEMENT_TONES } from "@/lib/announcements/ai-generator";

export interface AnnouncementDialogEvent {
  id: string;
  eventType: string;
  title: string;
  meeting_time?: string | null;
  location?: string | null;
  opponent?: string | null;
}

const TONES_LABELS: Record<string, string> = {
  motivant: "Motivant",
  sobre: "Sobre",
  chaleureux: "Chaleureux",
};

const POINTS_OPTIONS = [
  { id: "horaire", label: "Heure de rendez-vous" },
  { id: "equipement", label: "Tenue et équipement" },
  { id: "reponse", label: "Réponse obligatoire" },
  { id: "covoiturage", label: "Covoiturage" },
  { id: "lieu", label: "Lieu précis" },
];

interface AnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  event?: AnnouncementDialogEvent | null;
}

export function AnnouncementDialog({
  open,
  onOpenChange,
  teamId,
  event,
}: AnnouncementDialogProps) {
  const [mode, setMode] = useState<"convocation" | "info">("convocation");
  const [generation, setGeneration] = useState<"ai" | "manual">("ai");
  const [audience, setAudience] = useState<"joueurs" | "parents">("joueurs");
  const [tone, setTone] = useState<string>("motivant");
  const [topic, setTopic] = useState("");
  const [points, setPoints] = useState<string[]>([]);
  const [manualText, setManualText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);

  function togglePoint(id: string) {
    setPoints((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function generate() {
    if (generation === "manual") {
      if (!manualText.trim()) {
        toast.error("Écris le texte de l'annonce");
        return;
      }
      setResult(manualText.trim());
      return;
    }
    if (mode === "convocation" && !event) return;
    if (mode === "info" && !topic.trim()) {
      toast.error("Décris le sujet de l'information");
      return;
    }

    setLoading(true);
    setResult("");
    try {
      const res = await authFetch("/api/announcements/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          type: mode,
          eventId: event?.id,
          audience,
          tone,
          topic: topic.trim(),
          points,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la génération");
      setResult(data.text as string);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copie impossible");
    }
  }

  async function shareResult() {
    if (!result) return;
    if (navigator.share) {
      try {
        await navigator.share({ text: result });
      } catch {
        /* partage annulé */
      }
    } else {
      await copyResult();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-[var(--color-gold)]" />
            Rédiger une annonce
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={generation === "ai" ? "default" : "outline"}
              className={
                generation === "ai"
                  ? "flex-1 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
                  : "flex-1"
              }
              onClick={() => {
                setGeneration("ai");
                setResult("");
              }}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Générer par IA
            </Button>
            <Button
              size="sm"
              variant={generation === "manual" ? "default" : "outline"}
              className={
                generation === "manual"
                  ? "flex-1 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
                  : "flex-1"
              }
              onClick={() => {
                setGeneration("manual");
                setResult("");
              }}
            >
              <PenLine className="h-3.5 w-3.5 mr-1" />
              Écrire à la main
            </Button>
          </div>
          {event && (
            <div className="flex rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex gap-3 rounded-lg bg-[var(--color-navy)]/5 flex-1 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {event.eventType === "match" ? "Match" : "Entraînement"}
                    {event.opponent ? ` vs ${event.opponent}` : ""}
                    {event.meeting_time ? ` — RDV ${event.meeting_time.slice(0, 5)}` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground self-center shrink-0">
                  {event.location || "Lieu non précisé"}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === "convocation" ? "default" : "outline"}
              className={
                mode === "convocation"
                  ? "flex-1 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
                  : "flex-1"
              }
              onClick={() => {
                setMode("convocation");
                setResult("");
              }}
            >
              Convocation
            </Button>
            <Button
              size="sm"
              variant={mode === "info" ? "default" : "outline"}
              className={
                mode === "info"
                  ? "flex-1 bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
                  : "flex-1"
              }
              onClick={() => {
                setMode("info");
                setResult("");
              }}
            >
              Info aux parents
            </Button>
          </div>

          {mode === "info" && (
            <div className="space-y-2">
              <Label className="text-xs">Sujet de l&apos;information</Label>
              <Textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex: changement d'horaire du match de samedi, tournoi du week-end, réunion de début de saison..."
                className="text-sm"
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Destinataires</Label>
            <div className="flex gap-2">
              {(["joueurs", "parents"] as const).map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant="outline"
                  className={
                    audience === a
                      ? "flex-1 border-[var(--color-navy)] bg-[var(--color-navy)]/5 font-medium"
                      : "flex-1"
                  }
                  onClick={() => setAudience(a)}
                >
                  {a === "joueurs" ? "Les joueurs" : "Les parents"}
                </Button>
              ))}
            </div>
          </div>

          {generation === "ai" && (
            <div className="space-y-2">
              <Label className="text-xs">Ton</Label>
              <div className="flex gap-2">
                {ANNOUNCEMENT_TONES.map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant="outline"
                    className={
                      tone === t
                        ? "flex-1 border-[var(--color-navy)] bg-[var(--color-navy)]/5 font-medium"
                        : "flex-1"
                    }
                    onClick={() => setTone(t)}
                  >
                    {TONES_LABELS[t]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {generation === "ai" && (
            <div className="space-y-2">
              <Label className="text-xs">Points à inclure</Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {POINTS_OPTIONS.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer"
                  >
                    <Checkbox
                      checked={points.includes(p.id)}
                      onCheckedChange={() => togglePoint(p.id)}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {generation === "manual" && (
            <div className="space-y-2">
              <Label className="text-xs">Texte de l&apos;annonce</Label>
              <Textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={
                  mode === "convocation" && event
                    ? `Rendez-vous ${event.meeting_time?.slice(0, 5) || "…"} — ${event.location || "lieu à préciser"}…`
                    : "Rédige ici le texte de l'annonce (RDV, lieu, équipement, réponse attendue...)."
                }
                className="text-sm"
                rows={6}
              />
            </div>
          )}

          <Button
            className="w-full bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90 font-semibold"
            onClick={generate}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : generation === "manual" ? (
              <PenLine className="h-4 w-4 mr-1" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            {loading
              ? "Génération..."
              : generation === "manual"
                ? "Valider l'annonce"
                : "Générer l'annonce"}
          </Button>

          {result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-green-600">
                  {generation === "manual" ? "Annonce rédigée" : "Annonce générée"}
                </Label>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={copyResult}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {copied ? "Copié !" : "Copier"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={shareResult}>
                    <Share2 className="h-3.5 w-3.5 mr-1" />
                    Partager
                  </Button>
                </div>
              </div>
              <Textarea
                value={result}
                onChange={(e) => setResult(e.target.value)}
                rows={6}
                className="text-sm leading-relaxed"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
