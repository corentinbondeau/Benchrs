"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Trophy, Medal, Users } from "lucide-react";
import { toast } from "sonner";

interface Props {
  eventId: string;
  teamId: string;
  userId: string;
  /** Joueurs présents au match (attendances present/late) */
  presentPlayers: { id: string; first_name: string; last_name: string }[];
  /** ID de l'enfant (si l'utilisateur est un parent) */
  childPlayerId?: string;
}

interface Vote {
  voter_id: string;
  candidate_id: string;
}

function initials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

const PODIUM_STYLES = [
  "bg-[var(--color-gold)] text-[var(--color-navy)]",
  "bg-slate-300 text-slate-800",
  "bg-amber-700 text-white",
];

export function MatchMvpCard({ eventId, teamId, userId, presentPlayers, childPlayerId }: Props) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isPlayerPresent = useMemo(
    () => presentPlayers.some((p) => p.id === userId),
    [presentPlayers, userId]
  );

  const candidates = useMemo(() => {
    if (isPlayerPresent) {
      return presentPlayers.filter((p) => p.id !== userId);
    }
    if (childPlayerId) {
      return presentPlayers.filter((p) => p.id !== childPlayerId);
    }
    return presentPlayers;
  }, [presentPlayers, userId, isPlayerPresent, childPlayerId]);

  const canVote = isPlayerPresent || Boolean(childPlayerId);

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of presentPlayers) m.set(p.id, `${p.first_name} ${p.last_name}`);
    return m;
  }, [presentPlayers]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const v of votes) c.set(v.candidate_id, (c.get(v.candidate_id) || 0) + 1);
    return c;
  }, [votes]);

  const myVote = useMemo(
    () => votes.find((v) => v.voter_id === userId)?.candidate_id,
    [votes, userId]
  );

  const podium = useMemo(
    () =>
      [...counts.entries()]
        .map(([id, count]) => ({ id, count, name: nameMap.get(id) || "Joueur" }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
    [counts, nameMap]
  );

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("motm_votes")
        .select("voter_id, candidate_id")
        .eq("event_id", eventId);
      if (cancelled) return;
      setVotes((data || []) as Vote[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function vote(candidateId: string) {
    if (saving) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("motm_votes").upsert(
        {
          event_id: eventId,
          team_id: teamId,
          voter_id: userId,
          candidate_id: candidateId,
        },
        { onConflict: "event_id,voter_id" }
      );
      if (error) throw error;
      const { data } = await supabase
        .from("motm_votes")
        .select("voter_id, candidate_id")
        .eq("event_id", eventId);
      setVotes((data || []) as Vote[]);
      toast.success("Vote enregistré !");
    } catch (e) {
      console.error("[mvp] vote error:", e);
      toast.error("Erreur lors du vote");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
            Joueur du match
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const totalVotes = votes.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
          Joueur du match
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-4">
          {canVote
            ? "Vote pour le joueur du match (un seul vote par personne)."
            : "Les joueurs présents et les parents votent pour le joueur du match."}
        </p>

        {canVote && candidates.length > 0 && (
          <div className="mb-5 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {myVote ? "Ton vote" : "Vote"}
              </p>
              <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes > 1 ? "s" : ""}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {candidates.map((p) => {
                const selected = myVote === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={saving}
                    onClick={() => vote(p.id)}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                      selected
                        ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={undefined} />
                      <AvatarFallback className="text-[10px] bg-[var(--color-navy)] text-white">
                        {initials(p.first_name, p.last_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {p.first_name} {p.last_name}
                      </p>
                      {selected && (
                        <p className="text-[10px] text-[var(--color-gold)] font-semibold">
                          Ton choix
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {saving && (
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement...
              </p>
            )}
          </div>
        )}

        {myVote && !canVote && (
          <p className="mb-5 text-sm text-muted-foreground">
            Ton vote : <span className="font-semibold text-foreground">{nameMap.get(myVote) || "Joueur"}</span>
          </p>
        )}

        {votes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun vote pour l&apos;instant.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Medal className="h-3.5 w-3.5" /> Podium
            </p>
            {podium.map((entry, i) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${PODIUM_STYLES[i] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm truncate">{entry.name}</span>
                  {myVote === entry.id && (
                    <span className="text-[10px] font-semibold text-[var(--color-gold)]">· ton choix</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {entry.count} vote{entry.count > 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {presentPlayers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            <Users className="h-3.5 w-3.5 inline mr-1" />
            Aucun joueur présent pour l&apos;instant.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
