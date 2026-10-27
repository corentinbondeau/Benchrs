"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { authFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { useTeam } from "@/lib/team";

type Props = {
  eventId: string;
  onSent?: () => void;
};

export function ResendConvocationsButton({ eventId, onSent }: Props) {
  const { currentTeam } = useTeam();
  const [loading, setLoading] = useState(false);

  async function resend() {
    if (!currentTeam) return;
    setLoading(true);
    try {
      // Récupérer les joueurs convoqués
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: attendances } = await supabase
        .from("attendances")
        .select("user_id, status")
        .eq("event_id", eventId);
      
      if (!attendances || attendances.length === 0) {
        toast.error("Aucun joueur convoqué");
        setLoading(false);
        return;
      }
      
      const userIds = attendances.map(a => a.user_id);
      
      const res = await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: currentTeam.id,
          user_ids: userIds,
          title: "Convocation (rappel)",
          body: "Rappel de convocation pour cet événement",
          type: "convocation",
          reference_id: eventId,
          url: `/events/${eventId}`,
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Erreur");
        setLoading(false);
        return;
      }
      
      toast.success("Convocations relancées");
      onSent?.();
    } catch (e) {
      toast.error("Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={resend} disabled={loading}>
      <RotateCcw className="h-4 w-4 mr-1" />
      {loading ? "Envoi..." : "Relancer les convocations"}
    </Button>
  );
}
