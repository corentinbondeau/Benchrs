"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BarChart3,
  Check,
  Loader2,
  Plus,
  Trash2,
  Vote,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface PollVote {
  poll_id: string;
  user_id: string;
  option_index: number;
}

interface Poll {
  id: string;
  team_id: string;
  title: string;
  options: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export default function PollsPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";

  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  const loadData = useCallback(async () => {
    if (!currentTeam) return { polls: [] as Poll[], votes: [] as PollVote[] };
    const supabase = createClient();
    const { data: pollsRes } = await supabase
      .from("team_polls")
      .select("*")
      .eq("team_id", currentTeam.id)
      .order("created_at", { ascending: false });
    const pollRows = (pollsRes as Poll[]) || [];
    if (pollRows.length === 0) return { polls: [], votes: [] as PollVote[] };
    const { data: votesRes } = await supabase
      .from("poll_votes")
      .select("poll_id, user_id, option_index")
      .in("poll_id", pollRows.map((p) => p.id));
    return { polls: pollRows, votes: (votesRes as PollVote[]) || [] };
  }, [currentTeam]);

  useEffect(() => {
    let cancelled = false;
    if (!currentTeam) {
      setLoading(false);
      return;
    }
    loadData()
      .then((res) => {
        if (cancelled) return;
        setPolls(res.polls);
        setVotes(res.votes);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTeam, loadData]);

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  function updateOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }

  async function handleCreate() {
    if (!currentTeam) return;
    if (!title.trim()) {
      toast.error("Donne un titre au sondage");
      return;
    }
    const valid = options.map((o) => o.trim()).filter(Boolean);
    if (valid.length < 2) {
      toast.error("Ajoute au moins 2 options");
      return;
    }
    setCreating(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("team_polls").insert({
        team_id: currentTeam.id,
        title: title.trim(),
        options: valid,
        created_by: user?.id,
      });
      if (error) throw error;
      toast.success("Sondage créé !");
      setTitle("");
      setOptions(["", ""]);
      setCreateOpen(false);
      loadData().then((res) => {
        setPolls(res.polls);
        setVotes(res.votes);
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  }

  async function handleVote(pollId: string, optionIndex: number) {
    if (!user || !currentTeam) return;
    const supabase = createClient();
    const { error } = await supabase.from("poll_votes").upsert(
      {
        poll_id: pollId,
        team_id: currentTeam.id,
        user_id: user.id,
        option_index: optionIndex,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "poll_id,user_id" }
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setVotes((prev) => {
      const rest = prev.filter((v) => v.poll_id !== pollId);
      return [...rest, { poll_id: pollId, user_id: user.id, option_index: optionIndex }];
    });
    toast.success("Vote enregistré");
  }

  async function handleDelete(pollId: string) {
    if (!confirm("Supprimer ce sondage et tous ses votes ?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("team_polls").delete().eq("id", pollId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPolls((prev) => prev.filter((p) => p.id !== pollId));
    setVotes((prev) => prev.filter((v) => v.poll_id !== pollId));
    toast.success("Sondage supprimé");
  }

  function pollResults(pollId: string, optionCount: number) {
    const pollVotes = votes.filter((v) => v.poll_id === pollId);
    const counts = Array.from({ length: optionCount }, (_, i) => pollVotes.filter((v) => v.option_index === i).length);
    const total = pollVotes.length;
    return { counts, total };
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Sondages</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Votes rapides pour l&apos;équipe
          </p>
        </div>
        {isCoach && (
          <Button
            className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Nouveau sondage
          </Button>
        )}
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : polls.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Vote className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Aucun sondage pour le moment.
            </p>
            {isCoach && (
              <p className="text-xs text-muted-foreground mt-1">
                Crée un sondage pour choisir le bus, la couleur du maillot, le repas d&apos;après-match...
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const { counts, total } = pollResults(poll.id, poll.options.length);
            const myVote = votes.find((v) => v.poll_id === poll.id && v.user_id === user?.id);
            const hasVoted = !!myVote;
            return (
              <Card key={poll.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-[var(--color-gold)]" />
                      {poll.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {total} votant{total > 1 ? "s" : ""}
                      </span>
                      {isCoach && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(poll.id)}
                          aria-label="Supprimer le sondage"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {poll.options.map((opt, i) => {
                    const count = counts[i] || 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    const isMine = myVote?.option_index === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={hasVoted && !isMine}
                        onClick={() => handleVote(poll.id, i)}
                        className={`relative w-full overflow-hidden rounded-lg border p-3 text-left transition-all ${
                          isMine
                            ? "border-[var(--color-gold)] bg-[var(--color-gold)]/10"
                            : hasVoted
                              ? "opacity-70"
                              : "hover:border-blue-300"
                        }`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 bg-[var(--color-gold)]/15 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <div className="relative flex items-center justify-between gap-2">
                          <span className="text-sm font-medium flex items-center gap-2">
                            {isMine && <Check className="h-3.5 w-3.5 text-[var(--color-gold)]" />}
                            {opt}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {hasVoted ? `${count} · ${pct}%` : ""}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {!hasVoted && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Clique sur une option pour voter.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog de création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau sondage</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Question</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Quel bus pour dimanche ?"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Options</Label>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={opt}
                      onChange={(e) => updateOption(i, e.target.value)}
                      placeholder={`Option ${i + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
                      disabled={options.length <= 2}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOptions((prev) => [...prev, ""])}
                disabled={options.length >= 8}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter une option
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button
              className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              Créer le sondage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
