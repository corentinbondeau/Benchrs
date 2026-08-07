"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Star, Users } from "lucide-react";
import { toast } from "sonner";

interface Props {
  eventId: string;
  teamId: string;
  userId: string;
  /** IDs des joueurs présents au match (attendances present/late) */
  presentPlayers: { id: string; first_name: string; last_name: string }[];
  /** ID de l'enfant (si l'utilisateur est un parent) */
  childPlayerId?: string;
}

interface Aggregated {
  player_id: string;
  avg: number;
  count: number;
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function PlayerRatings({ eventId, teamId, userId, presentPlayers, childPlayerId }: Props) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [aggregated, setAggregated] = useState<Aggregated[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isPlayerPresent = useMemo(
    () => presentPlayers.some((p) => p.id === userId),
    [presentPlayers, userId]
  );

  // Qui l'utilisateur peut-il noter ?
  const rateable = useMemo(() => {
    if (isPlayerPresent) {
      return presentPlayers.filter((p) => p.id !== userId);
    }
    if (childPlayerId) {
      return presentPlayers.filter((p) => p.id !== childPlayerId);
    }
    return presentPlayers;
  }, [presentPlayers, userId, isPlayerPresent, childPlayerId]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      try {
        const [mineRes, allRes] = await Promise.all([
          supabase
            .from("match_player_ratings")
            .select("player_id, rating")
            .eq("event_id", eventId)
            .eq("rater_id", userId),
          supabase
            .from("match_player_ratings")
            .select("player_id, rating")
            .eq("event_id", eventId),
        ]);
        if (cancelled) return;
        const mine: Record<string, number> = {};
        (mineRes.data || []).forEach((r) => {
          mine[(r as { player_id: string }).player_id] = (r as { rating: number }).rating;
        });
        setRatings(mine);

        const acc: Record<string, { sum: number; count: number }> = {};
        (allRes.data || []).forEach((r) => {
          const pid = (r as { player_id: string }).player_id;
          const val = (r as { rating: number }).rating;
          acc[pid] = acc[pid] || { sum: 0, count: 0 };
          acc[pid].sum += val;
          acc[pid].count += 1;
        });
        setAggregated(
          Object.entries(acc).map(([player_id, { sum, count }]) => ({
            player_id,
            avg: Math.round((sum / count) * 10) / 10,
            count,
          }))
        );
      } catch (e) {
        console.error("[player-ratings] load error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, userId]);

  async function saveAll() {
    const entries = Object.entries(ratings).filter(([, r]) => r > 0);
    if (entries.length === 0) {
      toast.error("Choisis au moins une note");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      for (const [playerId, rating] of entries) {
        const { error } = await supabase.from("match_player_ratings").upsert(
          {
            event_id: eventId,
            team_id: teamId,
            rater_id: userId,
            player_id: playerId,
            rating,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "event_id,rater_id,player_id" }
        );
        if (error) throw error;
      }

      const { data: existing } = await supabase
        .from("match_player_ratings")
        .select("player_id")
        .eq("event_id", eventId)
        .eq("rater_id", userId);
      const removedIds = (existing || [])
        .map((r) => (r as { player_id: string }).player_id)
        .filter((pid) => !(ratings[pid] > 0));
      if (removedIds.length > 0) {
        await supabase
          .from("match_player_ratings")
          .delete()
          .eq("event_id", eventId)
          .eq("rater_id", userId)
          .in("player_id", removedIds);
      }

      toast.success("Notes enregistrées !");
      const { data: all } = await supabase
        .from("match_player_ratings")
        .select("player_id, rating")
        .eq("event_id", eventId);
      const acc: Record<string, { sum: number; count: number }> = {};
      (all || []).forEach((r) => {
        const pid = (r as { player_id: string }).player_id;
        const val = (r as { rating: number }).rating;
        acc[pid] = acc[pid] || { sum: 0, count: 0 };
        acc[pid].sum += val;
        acc[pid].count += 1;
      });
      setAggregated(
        Object.entries(acc).map(([player_id, { sum, count }]) => ({
          player_id,
          avg: Math.round((sum / count) * 10) / 10,
          count,
        }))
      );
    } catch (e) {
      console.error("[player-ratings] save error:", e);
      toast.error("Erreur lors de l'enregistrement des notes");
    } finally {
      setSaving(false);
    }
  }

  function renderStars(playerId: string, value: number, onChange?: (v: number) => void) {
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 10 }, (_, i) => {
          const filled = i < value;
          return onChange ? (
            <button
              key={i}
              type="button"
              onClick={() => onChange(i + 1)}
              className={`text-sm leading-none transition-transform hover:scale-110 ${
                filled ? "text-[var(--color-gold)]" : "text-muted"
              }`}
              aria-label={`${i + 1}/10`}
            >
              <Star className={`h-4 w-4 ${filled ? "fill-[var(--color-gold)]" : ""}`} />
            </button>
          ) : (
            <Star
              key={i}
              className={`h-3.5 w-3.5 ${filled ? "fill-[var(--color-gold)] text-[var(--color-gold)]" : "text-muted"}`}
            />
          );
        })}
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--color-gold)]" />
            Notes entre joueurs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const canRate = isPlayerPresent || Boolean(childPlayerId);
  const allRated = rateable.length > 0 && rateable.every((p) => ratings[p.id] > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--color-gold)]" />
            Notes entre joueurs
          </CardTitle>
          {canRate && rateable.length > 0 && (
            <Button
              size="sm"
              className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={saveAll}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Star className="h-3.5 w-3.5 mr-1" />
              )}
              {allRated ? "Modifier mes notes" : "Enregistrer mes notes"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          {isPlayerPresent
            ? "Note les joueurs présents au match (tu ne peux pas te noter toi-même)."
            : childPlayerId
              ? "Note les joueurs présents au match (sauf ton enfant)."
              : "Notes données par les joueurs et les parents après le match."}
        </p>

        {presentPlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun joueur présent pour l&apos;instant. Les notes seront disponibles dès qu&apos;un
            joueur sera présent au match.
          </p>
        ) : (
          <>
            {canRate && rateable.length > 0 && (
              <div className="mb-5 space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Mes notes
                </p>
                {rateable.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={undefined} />
                        <AvatarFallback className="text-[10px] bg-[var(--color-navy)] text-white">
                          {initials(p.first_name, p.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">
                        {p.first_name} {p.last_name}
                      </span>
                    </div>
                    {renderStars(p.id, ratings[p.id] || 0, (v) =>
                      setRatings((r) => ({ ...r, [p.id]: r[p.id] === v ? 0 : v }))
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Moyennes
              </p>
              {presentPlayers.map((p) => {
                const agg = aggregated.find((a) => a.player_id === p.id);
                const avg = agg?.avg ?? 0;
                const count = agg?.count ?? 0;
                const isMe = p.id === userId;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={undefined} />
                        <AvatarFallback className="text-[10px] bg-[var(--color-navy)] text-white">
                          {initials(p.first_name, p.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">
                        {p.first_name} {p.last_name}
                        {isMe && <span className="text-xs text-muted-foreground"> (toi)</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {count > 0 ? (
                        <>
                          {renderStars(p.id, avg)}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {avg}/10 · {count} note{count > 1 ? "s" : ""}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Aucune note</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
