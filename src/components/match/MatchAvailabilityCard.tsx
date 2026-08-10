"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  CalendarCheck,
  Check,
  HelpCircle,
  Loader2,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";
import { fetchTeamActivePlayers } from "@/lib/players";
import type { Profile } from "@/types";

interface AvailabilityRow {
  player_id: string;
  availability: "dispo" | "pas_dispo" | "incertain";
}

type AvailabilityValue = "dispo" | "pas_dispo" | "incertain";

const LABELS: Record<AvailabilityValue, string> = {
  dispo: "Dispo",
  pas_dispo: "Pas dispo",
  incertain: "Incertain",
};

const STYLES: Record<AvailabilityValue, string> = {
  dispo: "border-emerald-300 bg-emerald-50 text-emerald-700",
  pas_dispo: "border-red-300 bg-red-50 text-red-700",
  incertain: "border-amber-300 bg-amber-50 text-amber-700",
};

const ACTIVE_BTN: Record<AvailabilityValue, string> = {
  dispo: "bg-emerald-600 text-white border-emerald-600",
  pas_dispo: "bg-red-600 text-white border-red-600",
  incertain: "bg-amber-500 text-white border-amber-500",
};

export function MatchAvailabilityCard({
  eventId,
  teamId,
  isCoach,
  childPlayerId,
}: {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  childPlayerId?: string | null;
}) {
  const { user } = useAuth();
  const { userRole } = useTeam();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [responses, setResponses] = useState<Record<string, AvailabilityValue>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [playersRes, availRes] = await Promise.all([
      fetchTeamActivePlayers(teamId),
      supabase
        .from("match_availability")
        .select("player_id, availability")
        .eq("event_id", eventId)
        .eq("team_id", teamId),
    ]);
    return {
      players: playersRes,
      responses: Object.fromEntries(
        ((availRes.data || []) as AvailabilityRow[]).map((r) => [
          r.player_id,
          r.availability,
        ])
      ),
    };
  }, [teamId, eventId]);

  useEffect(() => {
    let cancelled = false;
    loadData()
      .then((res) => {
        if (cancelled) return;
        setPlayers(res.players);
        setResponses(res.responses);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const isPlayer = userRole === "player";
  const isParent = userRole === "parent";
  const targetPlayerId: string | undefined = isPlayer
    ? user?.id
    : isParent
      ? (childPlayerId ?? undefined)
      : undefined;

  async function notifyPoll() {
    setSending(true);
    try {
      const res = await authFetch("/api/matches/availability/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, teamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      toast.success(`Sondage envoyé à ${data.recipients} personne(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  }

  async function respond(value: AvailabilityValue) {
    if (!targetPlayerId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("match_availability").upsert(
      {
        event_id: eventId,
        team_id: teamId,
        player_id: targetPlayerId,
        availability: value,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "event_id,player_id" }
    );
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    setResponses((prev) => ({ ...prev, [targetPlayerId]: value }));
    setSaving(false);
    toast.success("Réponse enregistrée");
  }

  const total = players.length;
  const dispo = players.filter((p) => responses[p.id] === "dispo").length;
  const pasDispo = players.filter((p) => responses[p.id] === "pas_dispo").length;
  const incertain = players.filter((p) => responses[p.id] === "incertain").length;
  const answered = dispo + pasDispo + incertain;
  const rate = total > 0 ? Math.round((dispo / total) * 100) : 0;

  // Postes manquants : position avec aucun joueur dispo
  const missingPositions = new Set<string>();
  const positions = [...new Set(players.map((p) => p.position || "Joueur"))];
  for (const pos of positions) {
    const posPlayers = players.filter((p) => (p.position || "Joueur") === pos);
    if (!posPlayers.some((p) => responses[p.id] === "dispo")) {
      missingPositions.add(pos);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-[var(--color-gold)]" />
            Disponibilités avant match
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const myValue = targetPlayerId ? responses[targetPlayerId] : undefined;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-[var(--color-gold)]" />
            Disponibilités avant match
          </CardTitle>
          {isCoach && (
            <Button
              size="sm"
              className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={notifyPoll}
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Bell className="h-3.5 w-3.5 mr-1" />
              )}
              Lancer le sondage
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCoach ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-2xl font-bold text-emerald-700">{dispo}</p>
                <p className="text-[11px] text-emerald-700">Dispo</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-2xl font-bold text-amber-700">{incertain}</p>
                <p className="text-[11px] text-amber-700">Incertain</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-2xl font-bold text-red-700">{pasDispo}</p>
                <p className="text-[11px] text-red-700">Pas dispo</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Taux de disponibilité</span>
                <span className="font-bold">{rate}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    rate >= 80 ? "bg-emerald-500" : rate >= 50 ? "bg-amber-500" : "bg-red-500"
                  }`}
                  style={{ width: `${rate}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {answered}/{total} joueur{answered > 1 ? "s" : ""} ont répondu
              </p>
            </div>

            {missingPositions.size > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                  <UserX className="h-3.5 w-3.5" /> Postes manquants
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...missingPositions].map((pos) => (
                    <Badge key={pos} className="bg-red-100 text-red-700 border border-red-200">
                      {pos}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Réponses par joueur
              </p>
              <div className="space-y-1">
                {players.map((p) => {
                  const v = responses[p.id];
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5"
                    >
                      <span className="text-sm font-medium truncate">
                        {p.first_name} {p.last_name}
                      </span>
                      {v ? (
                        <Badge className={STYLES[v]}>
                          <Check className="h-3 w-3 mr-1" />
                          {LABELS[v]}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Pas de réponse
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : targetPlayerId ? (
          <>
            <p className="text-sm text-muted-foreground">
              {isParent ? "Seras-tu disponible ?" : "Sera-tu disponible pour ce match ?"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(["dispo", "incertain", "pas_dispo"] as AvailabilityValue[]).map((v) => (
                <button
                  key={v}
                  disabled={saving}
                  onClick={() => respond(v)}
                  className={`rounded-lg border p-3 text-center text-sm font-medium transition-all ${
                    myValue === v ? ACTIVE_BTN[v] : STYLES[v]
                  } ${saving ? "opacity-60" : ""}`}
                >
                  {myValue === v ? <Check className="h-3.5 w-3.5 mx-auto mb-0.5" /> : null}
                  {LABELS[v]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {myValue ? (
                <>
                  Ta réponse :{" "}
                  <span className="font-semibold">{LABELS[myValue]}</span> — tu peux la
                  modifier jusqu&apos;au match.
                </>
              ) : (
                "Réponds pour aider le coach à préparer la composition."
              )}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4" /> Connecte-toi en tant que joueur pour répondre.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
