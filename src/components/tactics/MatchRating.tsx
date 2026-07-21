"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  shirt_number: number | null;
}

interface Rating {
  id: string;
  player_id: string;
  rating: number;
  comment: string | null;
  rater: { id: string; first_name: string; last_name: string };
  player: { id: string; first_name: string; last_name: string; shirt_number: number | null };
}

interface MatchRatingProps {
  eventId: string;
  players: Player[];
}

export function MatchRating({ eventId, players }: MatchRatingProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/match-ratings?event_id=${eventId}`)
      .then((res) => res.json())
      .then((data) => {
        setRatings(Array.isArray(data) ? data : []);
      });
  }, [eventId]);

  const myRatings = useMemo(() => {
    const my: Record<string, number> = {};
    ratings.forEach((r) => {
      if (r.rater.id === session?.user?.id) {
        my[r.player_id] = r.rating;
      }
    });
    return my;
  }, [ratings, session?.user?.id]);

  async function submitRating(playerId: string, rating: number) {
    setSubmitting(true);
    try {
      await fetch("/api/match-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, player_id: playerId, rating }),
      });
      // Optimistic update
      setRatings((prev) => {
        const existing = prev.find((r) => r.player_id === playerId && r.rater.id === session?.user?.id);
        if (existing) {
          return prev.map((r) => r.id === existing.id ? { ...r, rating } : r);
        }
        return prev;
      });
    } finally {
      setSubmitting(false);
    }
  }

  function getAverageRating(playerId: string) {
    const playerRatings = ratings.filter((r) => r.player_id === playerId && r.player_id !== r.rater.id);
    if (playerRatings.length === 0) return null;
    return (playerRatings.reduce((sum, r) => sum + r.rating, 0) / playerRatings.length).toFixed(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4" />
          Note du match
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Notez chaque joueur de 1 à 5 étoiles (vos notes ne sont visibles que par vous).
        </p>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {players.map((player) => {
            const avg = getAverageRating(player.id);
            const myRating = myRatings[player.id];

            return (
              <div key={player.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  {player.shirt_number && (
                    <Badge variant="outline" className="w-8 justify-center text-xs">
                      {player.shirt_number}
                    </Badge>
                  )}
                  <span className="text-sm font-medium">
                    {player.first_name} {player.last_name}
                  </span>
                  {avg && (
                    <Badge variant="secondary" className="text-xs">
                      {avg} ★
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => submitRating(player.id, star)}
                      disabled={submitting}
                      className="p-0.5"
                    >
                      <Star
                        className={`h-4 w-4 transition-colors ${
                          myRating && star <= myRating
                            ? "fill-[var(--gold)] text-[var(--gold)]"
                            : "text-muted-foreground hover:text-[var(--gold)]"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
