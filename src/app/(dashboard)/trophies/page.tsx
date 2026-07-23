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
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy,
  ThumbsUp,
  Plus,
  Vote,
  Award,
  Crown,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { MotmVote, TrophyItem, Profile, Event } from "@/types";

export default function TrophiesPage() {
  const { user } = useAuth();
  const isCoach = user?.profile?.role === "coach";

  const [votes, setVotes] = useState<(MotmVote & { candidate?: Profile })[]>([]);
  const [trophies, setTrophies] = useState<(TrophyItem & { recipient?: Profile })[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const [voteSessionOpen, setVoteSessionOpen] = useState(false);
  const [voteSessionEventId, setVoteSessionEventId] = useState<string>("");
  const [voteSessionSaving, setVoteSessionSaving] = useState(false);

  const [trophyOpen, setTrophyOpen] = useState(false);
  const [editingTrophy, setEditingTrophy] = useState<TrophyItem | null>(null);
  const [trophyTitle, setTrophyTitle] = useState("");
  const [trophyDescription, setTrophyDescription] = useState("");
  const [trophyRecipient, setTrophyRecipient] = useState<string>("");
  const [trophySaving, setTrophySaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<TrophyItem | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [votesRes, trophiesRes, playersRes, eventsRes] = await Promise.all([
      supabase
        .from("motm_votes")
        .select("*, candidate:profiles!motm_votes_candidate_id_fkey(first_name, last_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("trophies")
        .select("*, recipient:profiles!trophies_awarded_to_fkey(first_name, last_name)")
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

    setVotes((votesRes.data as (MotmVote & { candidate?: Profile })[]) || []);
    setTrophies((trophiesRes.data as (TrophyItem & { recipient?: Profile })[]) || []);
    setPlayers((playersRes.data as Profile[]) || []);
    setEvents((eventsRes.data as Event[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isCoachVote = (v: MotmVote) => v.voter_id === v.candidate_id && v.voter_id === user?.id;

  async function handleCreateVoteSession() {
    if (!voteSessionEventId) {
      toast.error("Sélectionnez un événement");
      return;
    }
    setVoteSessionSaving(true);
    const supabase = createClient();
    const sessionId = `motm-${voteSessionEventId}-${Date.now()}`;
    const { error } = await supabase.from("motm_votes").insert({
      event_id: sessionId,
      voter_id: user!.id,
      candidate_id: user!.id,
    });
    setVoteSessionSaving(false);
    if (error) {
      toast.error("Erreur lors de la création");
      return;
    }
    toast.success("Session de vote créée");
    setVoteSessionOpen(false);
    setVoteSessionEventId("");
    fetchData();
  }

  async function handleVote(sessionEventId: string, candidateId: string) {
    if (!user?.id) return;

    const supabase = createClient();
    const { data: existing } = await supabase
      .from("motm_votes")
      .select("id")
      .eq("event_id", sessionEventId)
      .eq("voter_id", user.id)
      .neq("voter_id", "candidate_id")
      .maybeSingle();

    if (existing) {
      toast.error("Vous avez déjà voté pour cette session");
      return;
    }

    const { error } = await supabase.from("motm_votes").insert({
      event_id: sessionEventId,
      voter_id: user.id,
      candidate_id: candidateId,
    });
    if (error) {
      toast.error("Erreur lors du vote");
      return;
    }
    toast.success("Vote enregistré");
    fetchData();
  }

  async function handleDeleteVoteSession(sessionEventId: string) {
    const supabase = createClient();
    await supabase.from("motm_votes").delete().eq("event_id", sessionEventId);
    toast.success("Session supprimée");
    fetchData();
  }

  function openCreateTrophy() {
    setEditingTrophy(null);
    setTrophyTitle("");
    setTrophyDescription("");
    setTrophyRecipient("");
    setTrophyOpen(true);
  }

  function openEditTrophy(trophy: TrophyItem) {
    setEditingTrophy(trophy);
    setTrophyTitle(trophy.title);
    setTrophyDescription(trophy.description || "");
    setTrophyRecipient(trophy.awarded_to || "");
    setTrophyOpen(true);
  }

  async function handleSaveTrophy() {
    if (!trophyTitle.trim() || !trophyRecipient) {
      toast.error("Titre et joueur requis");
      return;
    }
    setTrophySaving(true);
    const supabase = createClient();

    if (editingTrophy) {
      const { error } = await supabase
        .from("trophies")
        .update({
          title: trophyTitle.trim(),
          description: trophyDescription.trim() || null,
          awarded_to: trophyRecipient,
        })
        .eq("id", editingTrophy.id);
      setTrophySaving(false);
      if (error) { toast.error("Erreur lors de la modification"); return; }
      toast.success("Trophée modifié");
    } else {
      const { error } = await supabase.from("trophies").insert({
        title: trophyTitle.trim(),
        description: trophyDescription.trim() || null,
        awarded_to: trophyRecipient,
        awarded_by: user?.id,
      });
      setTrophySaving(false);
      if (error) { toast.error("Erreur lors de la création"); return; }
      toast.success("Trophée créé");
    }
    setTrophyOpen(false);
    fetchData();
  }

  async function handleDeleteTrophy(id: string) {
    const supabase = createClient();
    await supabase.from("trophies").delete().eq("id", id);
    toast.success("Trophée supprimé");
    setConfirmDelete(null);
    fetchData();
  }

  function getEventTitle(sessionEventId: string): string {
    if (!sessionEventId.startsWith("motm-")) return `Vote — ${sessionEventId}`;
    const parts = sessionEventId.split("-");
    if (parts.length >= 2) {
      const event = events.find((e) => e.id === parts[1]);
      if (event) return `Joueur du Match — ${event.title}`;
    }
    return `Vote — ${sessionEventId}`;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Trophées</h2>
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  const voteSessions = new Map<string, (MotmVote & { candidate?: Profile })[]>();
  for (const v of votes) {
    const existing = voteSessions.get(v.event_id) || [];
    existing.push(v);
    voteSessions.set(v.event_id, existing);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Trophées & Vie du Club</h2>
        <p className="text-muted-foreground mt-1">Récompenses, votes et moments mémorables</p>
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
                      <Label>Événement</Label>
                      <Select value={voteSessionEventId} onValueChange={(v) => setVoteSessionEventId(v ?? "")}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sélectionner un match" />
                        </SelectTrigger>
                        <SelectContent>
                          {events.filter((e) => e.type === "match").map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              {event.title} — {new Date(event.event_date).toLocaleDateString("fr-FR")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={handleCreateVoteSession} disabled={voteSessionSaving}>
                      {voteSessionSaving ? "Création..." : "Créer la session"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {Array.from(voteSessions.entries()).filter(([, sv]) => !isCoachVote(sv[0])).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Vote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Aucune session de vote en cours
              </CardContent>
            </Card>
          ) : (
            Array.from(voteSessions.entries())
              .filter(([, sv]) => !isCoachVote(sv[0]))
              .map(([eventId, sessionVotes]) => {
                const realVotes = sessionVotes.filter(
                  (v) => !(v.voter_id === v.candidate_id && v.voter_id === user?.id)
                );

                const voteCounts = new Map<string, number>();
                for (const v of realVotes) {
                  voteCounts.set(v.candidate_id, (voteCounts.get(v.candidate_id) || 0) + 1);
                }

                const hasVoted = realVotes.some((v) => v.voter_id === user?.id);

                const sortedCandidates = [...players]
                  .map((p) => ({ player: p, count: voteCounts.get(p.id) || 0 }))
                  .filter((c) => c.count > 0 || !hasVoted)
                  .sort((a, b) => b.count - a.count);

                const maxVotes = sortedCandidates.length > 0 ? sortedCandidates[0].count : 0;

                return (
                  <Card key={eventId}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ThumbsUp className="h-4 w-4 text-[var(--color-gold)]" />
                          {getEventTitle(eventId)}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {realVotes.length} vote{realVotes.length !== 1 ? "s" : ""}
                          </Badge>
                          {isCoach && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-500 hover:text-red-700"
                              onClick={() => handleDeleteVoteSession(eventId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {sortedCandidates.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Aucun vote pour le moment
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {sortedCandidates.map(({ player, count }, idx) => {
                            const isWinner = count === maxVotes && count > 0;
                            const pct = realVotes.length > 0 ? Math.round((count / realVotes.length) * 100) : 0;
                            return (
                              <div key={player.id} className="flex items-center gap-3 rounded-lg border p-3">
                                <div className="relative">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-royal)]/10 text-[var(--color-royal)] text-sm font-bold">
                                    {player.first_name[0]}{player.last_name[0]}
                                  </div>
                                  {isWinner && (
                                    <Crown className="absolute -top-1 -right-1 h-4 w-4 text-[var(--color-gold)]" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {player.first_name} {player.last_name}
                                  </p>
                                  <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-[var(--color-gold)] transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge variant={isWinner ? "default" : "secondary"}>
                                    {count} vote{count !== 1 ? "s" : ""}
                                  </Badge>
                                  {!hasVoted && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleVote(eventId, player.id)}
                                    >
                                      Voter
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
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
              <Button size="sm" onClick={openCreateTrophy}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nouveau trophée
              </Button>
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
                <div key={trophy.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Trophy className="h-5 w-5 text-[var(--color-gold)] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{trophy.title}</p>
                    {trophy.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{trophy.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {trophy.recipient ? `${trophy.recipient.first_name} ${trophy.recipient.last_name}` : "Joueur inconnu"}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(trophy.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  {isCoach && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditTrophy(trophy)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => setConfirmDelete(trophy)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Trophy Create/Edit Dialog */}
      <Dialog open={trophyOpen} onOpenChange={setTrophyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTrophy ? "Modifier le trophée" : "Créer un trophée"}</DialogTitle>
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
                onChange={(e) => setTrophyDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Joueur récipiendaire</Label>
              <Select value={trophyRecipient} onValueChange={(v) => setTrophyRecipient(v ?? "")}>
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
            <Button className="w-full" onClick={handleSaveTrophy} disabled={trophySaving}>
              {trophySaving ? "..." : editingTrophy ? "Enregistrer" : "Créer le trophée"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Trophy Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Supprimer le trophée</DialogTitle>
            <DialogDescription>
              Voulez-vous vraiment supprimer <strong>{confirmDelete?.title}</strong> ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(null)}>
              Annuler
            </Button>
            <Button
              className="flex-1 bg-red-600 text-white hover:bg-red-700"
              onClick={() => confirmDelete && handleDeleteTrophy(confirmDelete.id)}
            >
              Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
