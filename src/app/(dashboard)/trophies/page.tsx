"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, ThumbsUp } from "lucide-react";
import type { MotmVote, TrophyItem, Profile, Event } from "@/types";

export default function TrophiesPage() {
  const { user } = useAuth();
  const [votes, setVotes] = useState<(MotmVote & { candidate?: Profile })[]>([]);
  const [trophies, setTrophies] = useState<(TrophyItem & { recipient?: Profile })[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [votedEventId, setVotedEventId] = useState<string | null>(null);

  function fetchData() {
    const supabase = createClient();
    Promise.all([
      supabase.from("motm_votes").select("*, candidate:profiles!motm_votes_candidate_id_fkey(first_name, last_name)").order("created_at", { ascending: false }),
      supabase.from("trophies").select("*, recipient:profiles!trophies_awarded_to_fkey(first_name, last_name)").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*").eq("role", "player").eq("is_active", true).order("last_name"),
    ]).then(([votesRes, trophiesRes, playersRes]) => {
      setVotes((votesRes.data as (MotmVote & { candidate?: Profile })[]) || []);
      setTrophies((trophiesRes.data as (TrophyItem & { recipient?: Profile })[]) || []);
      setPlayers((playersRes.data as Profile[]) || []);
      setLoading(false);
    });
  }

  useEffect(() => { fetchData(); }, []);

  async function vote(candidateId: string) {
    if (!user?.id || votedEventId) return;
    const supabase = createClient();
    await supabase.from("motm_votes").insert({
      event_id: "last-match",
      voter_id: user.id,
      candidate_id: candidateId,
    });
    setVotedEventId("last-match");
    fetchData();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Trophées</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  // Tally votes
  const voteCounts = new Map<string, number>();
  for (const v of votes) {
    const cid = v.candidate_id;
    voteCounts.set(cid, (voteCounts.get(cid) || 0) + 1);
  }

  const sortedPlayers = [...players].sort((a, b) => (voteCounts.get(b.id) || 0) - (voteCounts.get(a.id) || 0));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Trophées & Vie du Club</h2>
        <p className="text-muted-foreground mt-1">Récompenses, votes et moments mémorables</p>
      </div>

      {/* MOTM Voting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-[var(--color-gold)]" />
            Joueur du mois
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun joueur</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {sortedPlayers.slice(0, 12).map((player, idx) => {
                const count = voteCounts.get(player.id) || 0;
                return (
                  <div key={player.id} className="rounded-lg border p-3 text-center space-y-2">
                    {idx === 0 && count > 0 && <Trophy className="h-5 w-5 text-[var(--color-gold)] mx-auto" />}
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold mx-auto">
                      {player.first_name[0]}{player.last_name[0]}
                    </div>
                    <p className="text-sm font-medium">{player.first_name}</p>
                    <Badge variant="secondary">{count} vote{count > 1 ? "s" : ""}</Badge>
                    {!votedEventId && (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => vote(player.id)}>
                        Voter
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trophy Case */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[var(--color-gold)]" />
            Palmarès
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trophies.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucun trophée attribué
            </p>
          ) : (
            <div className="space-y-2">
              {trophies.map((trophy) => (
                <div key={trophy.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Trophy className="h-5 w-5 text-[var(--color-gold)]" />
                  <div>
                    <p className="font-medium text-sm">{trophy.title}</p>
                    {trophy.recipient && (
                      <p className="text-xs text-muted-foreground">
                        {trophy.recipient.first_name} {trophy.recipient.last_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
