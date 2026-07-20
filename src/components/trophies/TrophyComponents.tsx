"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Star, Vote } from "lucide-react";
import type { Event, Profile, MotmVote } from "@/types";

export function MotmVoting() {
  const { data: session } = useSession();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [lastMatch, setLastMatch] = useState<Event | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const supabase = createClient();

    async function fetchData() {
      const { data: match } = await supabase
        .from("events")
        .select("*")
        .eq("type", "match")
        .eq("status", "completed")
        .order("event_date", { ascending: false })
        .limit(1)
        .single();

      if (!match) return;
      setLastMatch(match as Event);

      const { data: squad } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .eq("is_active", true)
        .order("last_name");
      setPlayers((squad as Profile[]) || []);

      if (session?.user?.id) {
        const { data: myVote } = await supabase
          .from("motm_votes")
          .select("candidate_id")
          .eq("event_id", match.id)
          .eq("voter_id", session.user.id)
          .single();

        if (myVote) {
          setHasVoted(true);
          setVotedFor(myVote.candidate_id);
        }
      }

      const { data: allVotes } = await supabase
        .from("motm_votes")
        .select("candidate_id")
        .eq("event_id", match.id);

      if (allVotes) {
        const counts: Record<string, number> = {};
        for (const v of allVotes) {
          counts[v.candidate_id] = (counts[v.candidate_id] || 0) + 1;
        }
        setVoteCounts(counts);
      }
    }

    fetchData();
  }, [session?.user?.id]);

  async function vote(candidateId: string) {
    if (!session?.user?.id || !lastMatch || hasVoted) return;

    const supabase = createClient();
    await supabase.from("motm_votes").insert({
      event_id: lastMatch.id,
      voter_id: session.user.id,
      candidate_id: candidateId,
    });

    setHasVoted(true);
    setVotedFor(candidateId);
    setVoteCounts((prev) => ({
      ...prev,
      [candidateId]: (prev[candidateId] || 0) + 1,
    }));
  }

  if (!lastMatch) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Aucun match terminé pour voter
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4 text-[var(--gold)]" />
          Homme du Match — {lastMatch.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Aucun joueur disponible
          </p>
        ) : (
          <div className="space-y-2">
            {players.map((player) => {
              const votes = voteCounts[player.id] || 0;
              const isVoted = votedFor === player.id;
              return (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--royal)]/10 text-[var(--royal)] text-xs font-bold">
                      {player.first_name[0]}
                      {player.last_name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {player.first_name} {player.last_name}
                      </p>
                      {player.shirt_number && (
                        <p className="text-xs text-muted-foreground">
                          #{player.shirt_number}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {votes > 0 && (
                      <Badge className="bg-[var(--gold)] text-[var(--gold-foreground)]">
                        {votes} vote{votes !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {!hasVoted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => vote(player.id)}
                      >
                        <Vote className="h-3 w-3 mr-1" />
                        Voter
                      </Button>
                    ) : isVoted ? (
                      <Badge className="bg-green-100 text-green-700">
                        ✓ Votre choix
                      </Badge>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TrophyCase() {
  const [trophies, setTrophies] = useState<
    { id: string; title: string; description: string | null; icon: string | null; recipient?: Profile }[]
  >([]);

  useEffect(() => {
    const supabase = createClient();
    async function fetchTrophies() {
      const { data } = await supabase
        .from("trophies")
        .select("*, recipient:profiles!trophies_awarded_to_fkey(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(20);

      setTrophies(
        (data as { id: string; title: string; description: string | null; icon: string | null; recipient?: Profile }[]) || []
      );
    }
    fetchTrophies();
  }, []);

  const funTrophies = [
    { title: "Plus beau but", icon: "⚽" },
    { title: "Meilleur dragueur", icon: "💃" },
    { title: "Pied gauche d'or", icon: "🦶" },
    { title: "Captain Fantastic", icon: "©️" },
    { title: "Le mur infranchissable", icon: "🧱" },
    { title: "Speed King", icon: "⚡" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[var(--gold)]" />
          Galerie de Trophées
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {funTrophies.map((trophy) => (
            <div
              key={trophy.title}
              className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
            >
              <span className="text-3xl">{trophy.icon}</span>
              <span className="text-xs font-medium text-center">
                {trophy.title}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
