"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClipboardCheck, Loader2, Star, Activity, Smile, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import type { SessionFeedback as SessionFeedbackRow, Profile } from "@/types";

const RATING_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LEVEL_OPTIONS = [1, 2, 3, 4, 5];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {RATING_OPTIONS.map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= value ? "fill-[var(--color-gold)] text-[var(--color-gold)]" : "text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}

function playerLabel(playerId: string, players: Record<string, Profile>) {
  const profile = players[playerId];
  return profile ? `${profile.first_name} ${profile.last_name}` : "Joueur";
}

function sortByPlayerName(rows: SessionFeedbackRow[], players: Record<string, Profile>) {
  return [...rows].sort((a, b) =>
    playerLabel(a.player_id, players).localeCompare(playerLabel(b.player_id, players))
  );
}

export function SessionFeedback({
  eventId,
  teamId,
  isCoach,
  userId,
  userRole,
  childId,
  trainingOver,
}: {
  eventId: string;
  teamId: string;
  isCoach: boolean;
  userId?: string;
  userRole: string | null;
  childId: string | null;
  trainingOver: boolean;
}) {
  const myPlayerId = userRole === "player" ? (userId ?? null) : childId;
  const [rows, setRows] = useState<SessionFeedbackRow[]>([]);
  const [players, setPlayers] = useState<Record<string, Profile>>({});
  const [mine, setMine] = useState<SessionFeedbackRow | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);
  const [morale, setMorale] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [history, setHistory] = useState<{ label: string; avg: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (): Promise<{
    rows: SessionFeedbackRow[];
    players: Record<string, Profile>;
  }> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("session_feedback")
      .select("*")
      .eq("event_id", eventId)
      .eq("team_id", teamId);
    const rows = (data || []) as SessionFeedbackRow[];
    const playerIds = Array.from(new Set(rows.map((r) => r.player_id)));
    let players: Record<string, Profile> = {};
    if (playerIds.length > 0) {
      const profRes = await supabase.from("profiles").select("*").in("id", playerIds);
      players = ((profRes.data as Profile[]) || []).reduce<Record<string, Profile>>(
        (acc, p) => ({ ...acc, [p.id]: p }),
        {}
      );
    }
    return { rows, players };
  }, [eventId, teamId]);

  const loadHistory = useCallback(async () => {
    const supabase = createClient();
    const { data: events } = await supabase
      .from("events")
      .select("id, event_date")
      .eq("team_id", teamId)
      .eq("type", "training")
      .neq("status", "cancelled")
      .lte("event_date", new Date().toISOString())
      .order("event_date", { ascending: false })
      .limit(10);
    const ids = (events || []).map((e) => (e as { id: string }).id);
    if (ids.length === 0) return [];
    const { data } = await supabase
      .from("session_feedback")
      .select("event_id, rating")
      .in("event_id", ids);
    const byEvent = new Map<string, { sum: number; n: number }>();
    for (const f of (data || []) as { event_id: string; rating: number | null }[]) {
      if (f.rating == null) continue;
      const acc = byEvent.get(f.event_id) || { sum: 0, n: 0 };
      acc.sum += f.rating;
      acc.n += 1;
      byEvent.set(f.event_id, acc);
    }
    const reversed = [...(events || [])].reverse();
    return reversed.map((e) => {
      const acc = byEvent.get((e as { id: string }).id);
      return {
        label: new Date((e as { event_date: string }).event_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        avg: acc ? Math.round((acc.sum / acc.n) * 10) / 10 : 0,
      };
    });
  }, [teamId]);

  useEffect(() => {
    if (!trainingOver) return;
    loadData().then(({ rows: res, players: profiles }) => {
      setRows(sortByPlayerName(res, profiles));
      setPlayers(profiles);
      const mineRow = myPlayerId ? res.find((r) => r.player_id === myPlayerId) ?? null : null;
      setMine(mineRow);
      setRating(mineRow?.rating ?? null);
      setIntensity(mineRow?.intensity ?? null);
      setMorale(mineRow?.morale ?? null);
      setComment(mineRow?.comment ?? "");
      setLoading(false);
    });
    if (isCoach) {
      loadHistory().then((res) => setHistory(res));
    }
  }, [trainingOver, loadData, loadHistory, isCoach, myPlayerId]);

  if (!trainingOver) return null;
  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const avg = rows.length
    ? {
        rating: rows.reduce((s, r) => s + (r.rating ?? 0), 0) / rows.length,
        intensity: rows.reduce((s, r) => s + (r.intensity ?? 0), 0) / rows.length,
        morale: rows.reduce((s, r) => s + (r.morale ?? 0), 0) / rows.length,
      }
    : null;

  async function save() {
    if (!myPlayerId || rating == null) {
      toast.error("Donne au moins une note globale");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        event_id: eventId,
        player_id: myPlayerId,
        team_id: teamId,
        rating,
        intensity,
        morale,
        comment: comment.trim() || null,
      };
      const { data, error } = await supabase
        .from("session_feedback")
        .upsert(payload, { onConflict: "event_id,player_id" })
        .select("*")
        .single();
      if (error) throw error;
      setMine(data as SessionFeedbackRow);
      setRows((prev) => {
        const next = prev.filter((r) => r.player_id !== myPlayerId);
        return sortByPlayerName([...next, data as SessionFeedbackRow], players);
      });
      toast.success("Merci pour ton retour !");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-[var(--color-gold)]" />
          Analyse de la séance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCoach ? (
          <div className="space-y-3">
            {avg ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-[var(--color-royal)]">{avg.rating.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Note globale /10</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-[var(--color-royal)]">{avg.intensity.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Intensité /5</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-[var(--color-royal)]">{avg.morale.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">Moral /5</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aucun retour pour l&apos;instant.</p>
            )}
            {rows.length > 0 && (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.id} className="rounded-lg bg-muted/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{playerLabel(r.player_id, players)}</span>
                      {r.rating != null && <Stars value={r.rating} />}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>
                        Note globale :{" "}
                        <span className="font-semibold text-foreground">
                          {r.rating != null ? `${r.rating}/10` : "—"}
                        </span>
                      </span>
                      <span>
                        Intensité :{" "}
                        <span className="font-semibold text-foreground">
                          {r.intensity != null ? `${r.intensity}/5` : "—"}
                        </span>
                      </span>
                      <span>
                        Moral :{" "}
                        <span className="font-semibold text-foreground">
                          {r.morale != null ? `${r.morale}/5` : "—"}
                        </span>
                      </span>
                    </div>
                    {r.comment && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {history.length > 0 && (
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs font-medium flex items-center gap-1.5 mb-4 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Moyenne des notes (10 dernières séances)
                </p>
                <div className="flex items-end gap-1.5 h-24">
                  {history.map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-semibold text-foreground">{h.avg > 0 ? h.avg.toFixed(1) : "—"}</span>
                      <div
                        className={`w-full rounded-t ${h.avg > 0 ? "bg-[var(--color-royal)]" : "bg-muted-foreground/20"}`}
                        style={{ height: `${Math.max(h.avg * 8, h.avg > 0 ? 4 : 2)}px` }}
                      />
                      <span className="text-[9px] text-foreground/60">{h.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                Note globale de la séance
              </p>
              <div className="flex flex-wrap gap-1.5">
                {RATING_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setRating(n)}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold border transition-colors ${
                      rating === n
                        ? "bg-[var(--color-royal)] text-white border-[var(--color-royal)]"
                        : "bg-muted/40 text-muted-foreground border-transparent"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5" />
                  Intensité ressentie
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LEVEL_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setIntensity(n)}
                      className={`h-9 w-9 rounded-lg text-sm font-semibold border transition-colors ${
                        intensity === n
                          ? "bg-[var(--color-gold)] text-[var(--color-navy)] border-[var(--color-gold)]"
                          : "bg-muted/40 text-muted-foreground border-transparent"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Smile className="h-3.5 w-3.5" />
                  Moral
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {LEVEL_OPTIONS.map((n) => (
                    <button
                      key={n}
                      onClick={() => setMorale(n)}
                      className={`h-9 w-9 rounded-lg text-sm font-semibold border transition-colors ${
                        morale === n
                          ? "bg-[var(--color-gold)] text-[var(--color-navy)] border-[var(--color-gold)]"
                          : "bg-muted/40 text-muted-foreground border-transparent"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Un commentaire ?</p>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Ce qui t'a plu / à améliorer..."
                className="w-full rounded-lg border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-[var(--color-royal)]"
              />
            </div>
            <Button size="sm" className="bg-[var(--color-royal)] hover:bg-[var(--color-royal)]/90" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              {mine ? "Mettre à jour mon retour" : "Envoyer mon retour"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
