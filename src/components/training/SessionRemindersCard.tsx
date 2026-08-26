"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { toast } from "sonner";

interface SessionRemindersCardProps {
  trainingId: string;
  missingCount: number;
}

export function SessionRemindersCard({ trainingId, missingCount }: SessionRemindersCardProps) {
  const [sending, setSending] = useState(false);

  if (missingCount <= 0) return null;

  async function handleRemind() {
    setSending(true);
    const res = await authFetch(`/api/trainings/${trainingId}/remind-session`, {
      method: "POST",
    });
    setSending(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.error(data?.error || "Erreur lors de l'envoi de la relance");
      return;
    }

    const data = await res.json();
    if (data.reminded > 0) {
      toast.success(`Relance envoyée à ${data.reminded} destinataire${data.reminded > 1 ? "s" : ""}`);
    } else {
      toast.success("Tout le monde a déjà été relancé");
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 shrink-0 text-muted-foreground" />
          <p className="text-sm">
            {missingCount} joueur{missingCount > 1 ? "s" : ""} n&apos;{missingCount > 1 ? "ont" : "a"} pas
            complété {missingCount > 1 ? "leur" : "son"} RPE ou {missingCount > 1 ? "leur" : "son"} analyse
            de séance.
          </p>
        </div>
        <Button size="sm" onClick={handleRemind} disabled={sending}>
          {sending ? "Envoi..." : "Relancer"}
        </Button>
      </CardContent>
    </Card>
  );
}
