"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Megaphone, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";

export function ClubAnnounceDialog({
  clubId,
  clubName,
  variant = "outline",
}: {
  clubId: string;
  clubName: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  async function send() {
    if (!message.trim()) {
      toast.error("Écrivez un message");
      return;
    }
    setSending(true);
    setSentCount(null);
    try {
      const res = await authFetch("/api/clubs/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          title: title.trim() || undefined,
          message: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Envoi impossible");
      setSentCount(data.sent as number);
      setTitle("");
      setMessage("");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} size="sm" />}>
        <Megaphone className="h-3.5 w-3.5 mr-1" />
        Annoncer au club
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[var(--color-royal)]" />
            Annonce à {clubName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-muted-foreground">
            Le message arrive en notification (+ push) à tous les joueurs et parents du club.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="announce-title">Titre (optionnel)</Label>
            <Input
              id="announce-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Annonce du club"
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="announce-message">Message</Label>
            <Textarea
              id="announce-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ex. : Assemblée générale vendredi à 19h, salle annexe du club-house…"
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length}/2000
            </p>
          </div>
          {sentCount !== null && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Annonce envoyée à {sentCount} personne(s)
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button onClick={send} disabled={sending || !message.trim()}>
              {sending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Envoyer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}