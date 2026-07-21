"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy,
  ThumbsUp,
  Plus,
  Vote,
  Award,
  Star,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import type { MotmVote, TrophyItem, Profile, Event } from "@/types";

export default function TrophiesPage() {
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";

  const [votes, setVotes] = useState<
    (MotmVote & { candidate?: Profile })[]
  >([]);
  const [trophies, setTrophies] = useState<
    (TrophyItem & { recipient?: Profile })[]
  >([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  // Trophy dialog state
  const [trophyOpen, setTrophyOpen] = useState(false);
  const [trophyTitle, setTrophyTitle] = useState("");
  const [trophyDescription, setTrophyDescription] = useState("");
  const [trophyRecipient, setTrophyRecipient] = useState<string>("");
  const [trophySaving, setTrophySaving] = useState(false);

  // Vote session dialog state
  const [voteSessionOpen, setVoteSessionOpen] = useState(false);
  const [voteSessionTitle, setVoteSessionTitle] = useState("");
  const [voteSessionEventId, setVoteSessionEventId] = useState<string>("");
  const [voteSessionSaving, setVoteSessionSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [votesRes, trophiesRes, playersRes, eventsRes] = await Promise.all([
      supabase
        .from("motm_votes")
        .select(
          "*, candidate:profiles!motm_votes_candidate_id_fkey(first_name, last_name)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("trophies")
        .select(
          "*, recipient:profiles!trophies_awarded_to_fkey(first_name, last_name)"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("*")
        .eq("role", "player")
        .eq("is_active", true)
        .order("last_name"),
      supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false }),
    ]);

    setVotes(
      (votesRes.data as (MotmVote & { candidate?: Profile })[]) || []
    );
    setTrophies(
      (trophiesRes.data as (TrophyItem & { recipient?: Profile })[]) || []
    );
    setPlayers((playersRes.data as Profile[]) || []);
    setEvents((eventsRes.data as Event[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateTrophy() {
    if (!trophyTitle.trim() || !trophyRecipient) {
      toast.error("Veuillez remplir le titre et sélectionner un joueur");
      return;
    }
    setTrophySaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("trophies").insert({
      title: trophyTitle.trim(),
      description: trophyDescription.trim() || null,
      awarded_to: trophyRecipient,
      awarded_by: user?.id,
    });
    setTrophySaving(false);
    if (error) {
      toast.error("Erreur lors de la création du trophée");
      return;
    }
    toast.success("Trophée créé avec succès");
    setTrophyOpen(false);
    setTrophyTitle("");
    setTrophyDescription("");
    setTrophyRecipient("");
    fetchData();
  }

  async function handleCreateVoteSession() {
    if (!voteSessionTitle.trim() || !voteSessionEventId) {
      toast.error("Veuillez remplir le titre et sélectionner un événement");
      return;
    }
    setVoteSessionSaving(true);
    const supabase = createClient();
    const sessionId = `match-${voteSessionEventId}-${Date.now()}`;
    // Insert placeholder votes are not how it works — we just need the session to exist.
    // We'll track sessions by distinct event_id values.
    // Insert one "dummy" row so the event_id is tracked, then delete it? No — simpler:
    // just track unique event_ids from the votes table.
    // Actually, let's insert a single row so the session appears. We'll insert with a "system" candidate.
    // But the schema requires candidate_id to reference profiles. Let's think differently:
    // We store the vote session by just inserting into motm_votes when people vote.
    // The coach's role is to label a vote session — but there's no separate table for sessions.
    // So we'll use a trick: insert a vote with the candidate_id being the coach themselves as a placeholder,
    // then let users vote for real candidates. Actually, let's just NOT insert anything —
    // instead track vote sessions in component state, keyed by event_id.
    // BUT we need persistence. Let's check if we can just use the event_id as a grouping key.
    //
    // Simplest approach: create a "session marker" by inserting a motm_votes row with voter_id = coach's id
    // and candidate_id = coach's id, which we'll filter out when displaying.
    // Actually even simpler: just let the coach's creation just be a UI action.
    // The votes will appear once someone votes for that event_id.
    // We need some way to list "active vote sessions".
    //
    // Let's just use the motm_votes table grouped by event_id. The coach "creates" a session
    // by inserting a marker row. We'll mark it by inserting with candidate_id = a special sentinel,
    // but that won't work with FK.
    //
    // Most pragmatic approach: store session info in the event_id field and filter for unique event_ids
    // from the votes. The coach "opens" voting by inserting the first vote as a placeholder using their own ID.
    // We'll filter these out in display.
    //
    // Actually — simplest: just insert a vote row where voter_id = candidate_id = coach's id as a marker.
    // Then when tallying, we exclude votes where voter_id = candidate_id.

    // Even simpler: we don't need a marker. We just list unique event_ids from all votes.
    // The coach action of "creating a session" just means users can now vote for that event_id.
    // But without any row, there's nothing to show. So let's insert a session row.

    const { error } = await supabase.from("motm_votes").insert({
      event_id: sessionId,
      voter_id: user!.id,
      candidate_id: user!.id,
    });

    setVoteSessionSaving(false);
    if (error) {
      toast.error("Erreur lors de la création de la session de vote");
      return;
    }
    toast.success("Session de vote créée");
    setVoteSessionOpen(false);
    setVoteSessionTitle("");
    setVoteSessionEventId("");
    fetchData();
  }

  async function handleVote(eventId: string, candidateId: string) {
    if (!user?.id) return;
    const supabase = createClient();
    const { error } = await supabase.from("motm_votes").insert({
      event_id: eventId,
      voter_id: user.id,
      candidate_id: candidateId,
    });
    if (error) {
      if (error.code === "23505") {
        toast.error("Vous avez déjà voté pour cette session");
      } else {
        toast.error("Erreur lors du vote");
      }
      return;
    }
    toast.success("Vote enregistré");
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

  // Group votes by event_id
  const voteSessions = new Map<
    string,
    (MotmVote & { candidate?: Profile })[]
  >();
  for (const v of votes) {
    const existing = voteSessions.get(v.event_id) || [];
    existing.push(v);
    voteSessions.set(v.event_id, existing);
  }

  const isCoachVote = (v: MotmVote) =>
    v.voter_id === v.candidate_id && v.voter_id === user?.id;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Trophées & Vie du Club</h2>
        <p className="text-muted-foreground mt-1">
          Récompenses, votes et moments mémorables
        </p>
      </div>

      <Tabs defaultValue="votes">
        <TabsList>
          <TabsTrigger value="votes">
            <Vote className="h-4 w-4 mr-1.5" />
            Votes
          </TabsTrigger>
          <TabsTrigger value="palmares">
            <Trophy className="h-4 w-4 mr-1.5" />
            Palmarès
          </TabsTrigger>
        </TabsList>

        {/* ========== VOTES TAB ========== */}
        <TabsContent value="votes" className="space-y-4">
          {isCoach && (
            <div className="flex justify-end">
              <Dialog open={voteSessionOpen} onOpenChange={setVoteSessionOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nouvelle session
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Créer une session de vote</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Titre</Label>
                      <Input
                        placeholder="Joueur du Match - Team A vs Team B"
                        value={voteSessionTitle}
                        onChange={(e) => setVoteSessionTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Événement</Label>
                      <Select
                        value={voteSessionEventId}
                        onValueChange={(v) =>
                          setVoteSessionEventId(v ?? "")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sélectionner un événement" />
                        </SelectTrigger>
                        <SelectContent>
                          {events.map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              {event.title} —{" "}
                              {new Date(event.event_date).toLocaleDateString(
                                "fr-FR"
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleCreateVoteSession}
                      disabled={voteSessionSaving}
                    >
                      {voteSessionSaving ? "Création..." : "Créer la session"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {Array.from(voteSessions.entries()).filter(
            ([, sessionVotes]) => !isCoachVote(sessionVotes[0])
          ).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Vote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucune session de vote en cours
              </CardContent>
            </Card>
          ) : (
            Array.from(voteSessions.entries())
              .filter(([, sessionVotes]) => !isCoachVote(sessionVotes[0]))
              .map(([eventId, sessionVotes]) => {
                // Filter out coach marker votes
                const realVotes = sessionVotes.filter(
                  (v) => !(v.voter_id === v.candidate_id && v.voter_id === user?.id)
                );

                const voteCounts = new Map<string, number>();
                const voterNames = new Map<string, Profile>();
                for (const v of realVotes) {
                  voteCounts.set(
                    v.candidate_id,
                    (voteCounts.get(v.candidate_id) || 0) + 1
                  );
                  if (v.candidate) {
                    voterNames.set(v.candidate_id, v.candidate);
                  }
                }

                const hasVoted = realVotes.some(
                  (v) => v.voter_id === user?.id
                );

                const sortedCandidates = [...players]
                  .map((p) => ({
                    player: p,
                    count: voteCounts.get(p.id) || 0,
                  }))
                  .filter((c) => c.count > 0 || !hasVoted)
                  .sort((a, b) => b.count - a.count);

                const maxVotes =
                  sortedCandidates.length > 0
                    ? sortedCandidates[0].count
                    : 0;

                // Derive title from the first vote's event_id or use a fallback
                const sessionTitle =
                  eventId.startsWith("match-")
                    ? (() => {
                        const parts = eventId.split("-");
                        if (parts.length >= 2) {
                          const event = events.find((e) => e.id === parts[1]);
                          if (event) return `Joueur du Match — ${event.title}`;
                        }
                        return `Vote — ${eventId}`;
                      })()
                    : `Vote — ${eventId}`;

                return (
                  <Card key={eventId}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ThumbsUp className="h-4 w-4 text-[var(--color-gold)]" />
                        {sessionTitle}
                        <Badge variant="secondary" className="ml-auto">
                          {realVotes.length} vote
                          {realVotes.length !== 1 ? "s" : ""}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {sortedCandidates.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aucun vote pour le moment
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {sortedCandidates.map(
                            ({ player, count }, idx) => {
                              const isWinner =
                                count === maxVotes && count > 0;
                              const pct =
                                realVotes.length > 0
                                  ? Math.round(
                                      (count / realVotes.length) * 100
                                    )
                                  : 0;

                              return (
                                <div
                                  key={player.id}
                                  className="flex items-center gap-3 rounded-lg border p-3"
                                >
                                  <div className="relative">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                                      {player.first_name[0]}
                                      {player.last_name[0]}
                                    </div>
                                    {isWinner && (
                                      <Crown className="absolute -top-1 -right-1 h-4 w-4 text-[var(--color-gold)]" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium truncate">
                                        {player.first_name}{" "}
                                        {player.last_name}
                                      </p>
                                      {idx === 0 && count > 0 && (
                                        <Star className="h-3.5 w-3.5 text-[var(--color-gold)]" />
                                      )}
                                    </div>
                                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-[var(--color-gold)] transition-all"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <Badge
                                      variant={
                                        isWinner ? "default" : "secondary"
                                      }
                                    >
                                      {count} vote{count !== 1 ? "s" : ""}
                                    </Badge>
                                    {!hasVoted && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          handleVote(eventId, player.id)
                                        }
                                      >
                                        Voter
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                      {hasVoted && (
                        <p className="text-xs text-muted-foreground text-center mt-3">
                          Vous avez déjà voté pour cette session
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
          )}
        </TabsContent>

        {/* ========== PALMARÈS TAB ========== */}
        <TabsContent value="palmares" className="space-y-4">
          {isCoach && (
            <div className="flex justify-end">
              <Dialog open={trophyOpen} onOpenChange={setTrophyOpen}>
                <DialogTrigger render={<Button size="sm" />}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nouveau trophée
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Créer un trophée</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Titre</Label>
                      <Input
                        placeholder="Joueur du Mois Décembre"
                        value={trophyTitle}
                        onChange={(e) => setTrophyTitle(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Description (optionnel)</Label>
                      <Textarea
                        placeholder="Description du trophée..."
                        value={trophyDescription}
                        onChange={(e) =>
                          setTrophyDescription(e.target.value)
                        }
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Joueur récipiendaire</Label>
                      <Select
                        value={trophyRecipient}
                        onValueChange={(v) =>
                          setTrophyRecipient(v ?? "")
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sélectionner un joueur" />
                        </SelectTrigger>
                        <SelectContent>
                          {players.map((player) => (
                            <SelectItem key={player.id} value={player.id}>
                              {player.first_name} {player.last_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleCreateTrophy}
                      disabled={trophySaving}
                    >
                      {trophySaving ? "Création..." : "Créer le trophée"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {trophies.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucun trophée attribué
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {trophies.map((trophy) => (
                <div
                  key={trophy.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Trophy className="h-5 w-5 text-[var(--color-gold)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{trophy.title}</p>
                    {trophy.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {trophy.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {trophy.recipient
                        ? `${trophy.recipient.first_name} ${trophy.recipient.last_name}`
                        : "Joueur inconnu"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(trophy.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
