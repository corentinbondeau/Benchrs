"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import type { ReminderTarget } from "@/lib/convocation-reminders";

interface RemindAllButtonProps {
  targets: ReminderTarget[];
  pendingCount: number;
  teamId: string;
  onDone?: () => void;
  /**
   * Libellé compact ("Relancer tous") plutôt que le libellé détaillé avec le
   * nombre de joueurs. Utile dans les emplacements contraints en largeur
   * (ex: en-tête de bloc évènement dans une carte de tableau de bord).
   */
  compact?: boolean;
}

export function RemindAllButton({ targets, pendingCount, teamId, onDone, compact }: RemindAllButtonProps) {
  const [sending, setSending] = useState(false);

  if (pendingCount === 0 || targets.length === 0) return null;

  const label = compact
    ? "Relancer tous"
    : pendingCount === 1
      ? "Relancer le joueur"
      : `Relancer les ${pendingCount} joueurs`;

  async function handleRemindAll() {
    setSending(true);

    let successCount = 0;
    let failureCount = 0;

    for (const target of targets) {
      const dateStr = new Date(target.event.event_date).toLocaleDateString("fr-FR");
      const res = await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: target.userIds,
          title: `Relance : ${target.event.title}`,
          body: `Vous n'avez pas encore répondu à la convocation du ${dateStr}`,
          type: "rappel",
          reference_id: target.event.id,
          team_id: teamId,
          url:
            target.event.type === "match"
              ? `/matches/${target.event.id}`
              : `/trainings/${target.event.id}`,
        }),
      });

      if (res.ok) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    setSending(false);

    if (failureCount === 0) {
      toast.success(
        successCount > 1
          ? `Relances envoyées pour ${successCount} évènements`
          : "Relance envoyée"
      );
    } else if (successCount === 0) {
      toast.error("Échec de l'envoi des relances");
    } else {
      toast.warning(
        `${successCount} relance${successCount > 1 ? "s" : ""} envoyée${successCount > 1 ? "s" : ""}, ${failureCount} échec${failureCount > 1 ? "s" : ""}`
      );
    }

    onDone?.();
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 text-xs"
      disabled={sending}
      onClick={handleRemindAll}
    >
      <BellRing className="h-3.5 w-3.5" />
      {sending ? "Envoi..." : label}
    </Button>
  );
}
