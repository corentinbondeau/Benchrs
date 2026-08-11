"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { fetchTeamRecipientIds } from "@/lib/playerAlerts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Activity, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_PROTOCOL = `Protocole de récupération post-match :
1. 10 min de retour au calme : marche + étirements doux (quadriceps, ischio-jambiers, mollets, adducteurs).
2. Réhydratation : 500 ml d'eau (ou boisson isotonique) dans l'heure qui suit.
3. Collation protéinée + glucides dans les 2 h.
4. Douche froide 30 s en fin de douche.
5. Sommeil : viser 8 h, jambes surélevées.
6. Le lendemain : mobilisation douce 20-30 min (vélo, natation).`;

export function RecoveryProtocolCard({
  teamId,
  isCoach,
  matchOver,
  url,
}: {
  teamId: string;
  isCoach: boolean;
  matchOver: boolean;
  url: string;
}) {
  const [protocol, setProtocol] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(DEFAULT_PROTOCOL);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("team_settings")
      .select("recovery_protocol")
      .eq("team_id", teamId)
      .maybeSingle();
    return (data?.recovery_protocol as string | null) || null;
  }, [teamId]);

  useEffect(() => {
    loadData().then((res) => {
      setProtocol(res);
      setText(res || DEFAULT_PROTOCOL);
      setLoading(false);
    });
  }, [loadData]);

  async function saveAndSend() {
    setSending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("team_settings")
        .upsert({ team_id: teamId, recovery_protocol: text.trim() });
      if (error) throw error;
      setProtocol(text.trim());

      const recipients = await fetchTeamRecipientIds(teamId);
      if (recipients.length === 0) {
        toast.error("Aucun joueur actif dans l'équipe");
        return;
      }
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: recipients,
          title: "Routine de récupération 💪",
          body: "Le coach a partagé le protocole de récupération post-match. Suis les étapes dans l'heure qui suit.",
          type: "recuperation",
          reference_id: teamId,
          team_id: teamId,
          url,
        }),
      });
      toast.success("Protocole envoyé aux familles");
      setOpen(false);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSending(false);
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-4 w-4 text-[var(--color-gold)] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Routine de récupération</p>
              {protocol && !open ? (
                <p className="text-xs text-muted-foreground line-clamp-1">{protocol}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Protocole post-match envoyé aux joueurs : étirements, hydratation, sommeil.
                </p>
              )}
            </div>
          </div>
          {isCoach && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs shrink-0"
              disabled={!matchOver}
              onClick={() => setOpen(true)}
            >
              {matchOver ? (
                <>
                  <Send className="h-3 w-3 mr-1" />
                  Envoyer
                </>
              ) : (
                "Après le match"
              )}
            </Button>
          )}
        </div>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Routine de récupération</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="text-sm min-h-[220px]"
            />
            <p className="text-xs text-muted-foreground">
              Ce protocole sera enregistré pour l&apos;équipe et envoyé à tous les joueurs + parents.
            </p>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button size="sm" onClick={saveAndSend} disabled={sending || !text.trim()}>
              {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
              Enregistrer et envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
