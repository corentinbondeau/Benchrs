"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Vote,
  Plus,
  Trash2,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface Poll {
  id: string;
  question: string;
  options: string[];
  multiple: boolean;
  closes_at: string | null;
  created_at: string;
}

interface PollVote {
  id: string;
  poll_id: string;
  user_id: string;
  option_values: string[];
}

export default function ClubSondagesPage() {
  const { user } = useAuth();
  const { clubs, loading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("");
  const [multiple, setMultiple] = useState(false);
  const [closesAt, setClosesAt] = useState("");

  const supabaseRef = useRef(createClient());
  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const load = useCallback(
    async (cid: string) => {
      const { data: pollsData } = await supabaseRef.current
        .from("club_polls")
        .select("*")
        .eq("club_id", cid)
        .order("created_at", { ascending: false });
      const pollsRows = (pollsData || []) as Record<string, unknown>[];
      const parsed = pollsRows.map((p) => ({
        id: p.id as string,
        question: p.question as string,
        options: (p.options as string[]) || [],
        multiple: (p.multiple as boolean) ?? false,
        closes_at: (p.closes_at as string | null) ?? null,
        created_at: p.created_at as string,
      }));

      let votesRows: PollVote[] = [];
      if (parsed.length > 0) {
        const { data: votesData } = await supabaseRef.current
          .from("club_poll_votes")
          .select("*")
          .in(
            "poll_id",
            parsed.map((p) => p.id)
          );
        votesRows = ((votesData || []) as Record<string, unknown>[]).map((v) => ({
          id: v.id as string,
          poll_id: v.poll_id as string,
          user_id: v.user_id as string,
          option_values: (v.option_values as string[]) || [],
        }));
      }

      return { polls: parsed, votes: votesRows };
    },
    []
  );

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setPolls(res.polls);
      setVotes(res.votes);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
  }

  async function createPoll() {
    if (!clubId) return;
    const opts = optionsText
      .split("\n")
      .map((o) => o.trim())
      .filter(Boolean);
    if (!question.trim() || opts.length < 2) {
      toast.error("Question + au moins 2 options");
      return;
    }
    const { error } = await supabaseRef.current
      .from("club_polls")
      .insert({
        club_id: clubId,
        question: question.trim(),
        options: opts,
        multiple,
        closes_at: closesAt ? new Date(closesAt).toISOString() : null,
        created_by: user!.id,
      });
    if (error) {
      toast.error(error.message);
      return;
    }
    setCreateOpen(false);
    setQuestion("");
    setOptionsText("");
    setMultiple(false);
    setClosesAt("");
    refresh();
  }

  async function deletePoll(pollId: string) {
    const { error } = await supabaseRef.current
      .from("club_polls")
      .delete()
      .eq("id", pollId)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function closePoll(pollId: string) {
    const { error } = await supabaseRef.current
      .from("club_polls")
      .update({ closes_at: new Date().toISOString() })
      .eq("id", pollId)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function vote(poll: Poll, selected: string[]) {
    if (!user) return;
    const { error } = await supabaseRef.current
      .from("club_poll_votes")
      .upsert(
        {
          poll_id: poll.id,
          user_id: user.id,
          option_values: selected,
        },
        { onConflict: "poll_id,user_id" }
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Vote enregistré");
    refresh();
  }

  function refresh() {
    if (clubId) load(clubId).then((res) => {
      setPolls(res.polls);
      setVotes(res.votes);
    });
  }

  const pollVotes = (pollId: string) => votes.filter((v) => v.poll_id === pollId);
  const myVote = (pollId: string) =>
    votes.find((v) => v.poll_id === pollId && v.user_id === user?.id)?.option_values ?? null;

  return (
    <ClubPageShell
      title="Sondages du club"
      subtitle="Le comité pose les questions, les familles votent"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={loading || (clubId ? pageLoading : false)}
      actions={
        isCommittee ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Nouveau sondage
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Vote className="h-4 w-4 text-[var(--color-royal)]" />
                  Nouveau sondage
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="poll-question">Question</Label>
                  <Input
                    id="poll-question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ex. : Quel créneau pour le tournoi de printemps ?"
                    maxLength={300}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="poll-options">Options (une par ligne)</Label>
                  <Textarea
                    id="poll-options"
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                    placeholder={"Samedi matin\nSamedi toute la journée\nDimanche matin"}
                    rows={4}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={multiple}
                    onCheckedChange={setMultiple}
                    id="poll-multiple"
                  />
                  <Label htmlFor="poll-multiple">Réponses multiples possibles</Label>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="poll-closes">Clôture (optionnel)</Label>
                  <Input
                    id="poll-closes"
                    type="datetime-local"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={createPoll} disabled={!question.trim()}>
                    Créer
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {polls.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucun sondage pour le moment.
            </CardContent>
          </Card>
        )}
        {polls.map((poll) => {
          const pv = pollVotes(poll.id);
          const total = pv.length;
          const mine = myVote(poll.id);
          const closed = poll.closes_at != null && new Date(poll.closes_at) < new Date();
          const canVote = !closed;
          const counts = poll.options.map((o) => ({
            option: o,
            count: pv.filter((v) => v.option_values.includes(o)).length,
            iam: mine?.includes(o) ?? false,
          }));
          const maxCount = Math.max(1, ...counts.map((c) => c.count));

          return (
            <Card key={poll.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {poll.question}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      {poll.multiple && (
                        <Badge variant="secondary">Choix multiples</Badge>
                      )}
                      {closed ? (
                        <Badge variant="outline">
                          <Lock className="h-3 w-3 mr-1" />
                          Clôturé
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {total} vote{total > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {isCommittee && (
                    <div className="flex gap-1 shrink-0">
                      {!closed && (
                        <Button variant="outline" size="sm" onClick={() => closePoll(poll.id)}>
                          Clore
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deletePoll(poll.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {counts.map((c, idx) => {
                  const pct = total ? Math.round((c.count / total) * 100) : 0;
                  const selected = c.iam;
                  return (
                    <button
                      key={idx}
                      disabled={!canVote}
                      onClick={() => {
                        const next = poll.multiple
                          ? mine
                            ? mine.includes(c.option)
                              ? mine.filter((o) => o !== c.option)
                              : [...mine, c.option]
                            : [c.option]
                          : [c.option];
                        if (next.length === 0) return;
                        vote(poll, next);
                      }}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors ${
                        selected
                          ? "border-[var(--color-royal)] bg-[var(--color-royal)]/5"
                          : "hover:bg-accent"
                      } ${!canVote ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium flex items-center gap-2">
                          {selected && (
                            <CheckCircle2 className="h-4 w-4 text-[var(--color-royal)]" />
                          )}
                          {c.option}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.count} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-royal)]"
                          style={{ width: `${(c.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1">
                  {mine
                    ? canVote
                      ? "Cliquez pour modifier votre vote."
                      : "Vous avez participé."
                    : canVote
                      ? "Choisissez une réponse."
                      : "Sondage clôturé."}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ClubPageShell>
  );
}