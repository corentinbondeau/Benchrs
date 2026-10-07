"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lightbulb, Plus, ThumbsUp, Trash2, User } from "lucide-react";
import { toast } from "sonner";

interface Idea {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: "proposed" | "selected" | "in_progress" | "done" | "rejected";
  created_at: string;
  votes: number;
}

const IDEA_STATUS: Record<Idea["status"], { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
  proposed: { label: "Proposée", variant: "secondary" },
  selected: { label: "Retenue", variant: "default" },
  in_progress: { label: "En cours", variant: "default" },
  done: { label: "Réalisée", variant: "default" },
  rejected: { label: "Refusée", variant: "destructive" },
};

const STATUS_ORDER: Idea["status"][] = ["proposed", "selected", "in_progress", "done", "rejected"];

export default function ClubIdeesPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Idea["status"] | "all">("all");

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(
    async (cid: string, uid: string) => {
      const { data: ideasData } = await supabaseRef.current
        .from("club_ideas")
        .select("id, user_id, title, description, status, created_at")
        .eq("club_id", cid)
        .order("created_at", { ascending: false });
      const rows = ((ideasData || []) as Record<string, unknown>[]).map((i) => ({
        id: i.id as string,
        user_id: i.user_id as string,
        title: i.title as string,
        description: i.description as string,
        status: (i.status as Idea["status"]) ?? "proposed",
        created_at: i.created_at as string,
      }));

      let votesMap = new Map<string, number>();
      let myVoteSet = new Set<string>();
      let namesMap: Record<string, string> = {};
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id);
        const { data: votesData } = await supabaseRef.current.from("club_idea_votes").select("idea_id, user_id").in("idea_id", ids);
        votesMap = new Map<string, number>();
        myVoteSet = new Set<string>();
        for (const v of votesData || []) {
          const row = v as { idea_id: string; user_id: string };
          votesMap.set(row.idea_id, (votesMap.get(row.idea_id) ?? 0) + 1);
          if (row.user_id === uid) myVoteSet.add(row.idea_id);
        }
        const authors = [...new Set(rows.map((r) => r.user_id))];
        const { data: profiles } = await supabaseRef.current
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", authors);
        namesMap = Object.fromEntries(
          ((profiles || []) as { id: string; first_name: string | null; last_name: string | null }[]).map(
            (p) => [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Membre"]
          )
        );
      }

      const enriched = rows
        .map((r) => ({ ...r, votes: votesMap.get(r.id) ?? 0 }))
        .sort((a, b) => b.votes - a.votes || b.created_at.localeCompare(a.created_at));
      return { ideas: enriched, votes: myVoteSet, names: namesMap };
    },
    []
  );

  useEffect(() => {
    if (!clubId || !user) return;
    load(clubId, user.id).then((res) => {
      setIdeas(res.ideas);
      setMyVotes(res.votes);
      setNames(res.names);
      setPageLoading(false);
    });
  }, [clubId, user, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  function openCreate() {
    setTitle("");
    setDescription("");
    setDialogOpen(true);
  }

  async function createIdea() {
    const cleanTitle = title.trim();
    if (!clubId || !user) return;
    if (!cleanTitle || !description.trim()) {
      toast.error("Titre et description requis");
      return;
    }
    const { error } = await supabaseRef.current.from("club_ideas").insert({
      club_id: clubId,
      user_id: user.id,
      title: cleanTitle,
      description: description.trim(),
    });
    if (error) {
      toast.error("Impossible de proposer l'idée");
      return;
    }
    toast.success("Idée proposée !");
    setDialogOpen(false);
    load(clubId, user.id).then((res) => {
      setIdeas(res.ideas);
      setMyVotes(res.votes);
    });
  }

  async function toggleVote(ideaId: string) {
    if (!user) return;
    if (myVotes.has(ideaId)) {
      const { error } = await supabaseRef.current
        .from("club_idea_votes")
        .delete()
        .eq("idea_id", ideaId)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Impossible de retirer le vote");
        return;
      }
    } else {
      const { error } = await supabaseRef.current.from("club_idea_votes").insert({ idea_id: ideaId, user_id: user.id });
      if (error) {
        toast.error("Impossible de voter");
        return;
      }
    }
    if (clubId) {
      load(clubId, user.id).then((res) => {
        setIdeas(res.ideas);
        setMyVotes(res.votes);
      });
    }
  }

  async function setStatus(ideaId: string, status: Idea["status"]) {
    const { error } = await supabaseRef.current.from("club_ideas").update({ status }).eq("id", ideaId);
    if (error) {
      toast.error("Impossible de changer le statut");
      return;
    }
    if (clubId && user) {
      load(clubId, user.id).then((res) => {
        setIdeas(res.ideas);
        setMyVotes(res.votes);
      });
    }
  }

  async function deleteIdea(ideaId: string) {
    const { error } = await supabaseRef.current.from("club_ideas").delete().eq("id", ideaId);
    if (error) {
      toast.error("Impossible de supprimer l'idée");
      return;
    }
    if (clubId && user) {
      load(clubId, user.id).then((res) => {
        setIdeas(res.ideas);
        setMyVotes(res.votes);
      });
    }
  }

  const visibleIdeas = ideas.filter((i) => filter === "all" || i.status === filter);

  return (
    <ClubPageShell
      title="Boîte à idées"
      subtitle="Proposez, votez, le comité décide"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || pageLoading}
      actions={
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Proposer une idée
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
            Toutes ({ideas.length})
          </Button>
          {STATUS_ORDER.map((s) => {
            const count = ideas.filter((i) => i.status === s).length;
            return (
              <Button key={s} variant={filter === s ? "default" : "outline"} size="sm" onClick={() => setFilter(s)}>
                {IDEA_STATUS[s].label} ({count})
              </Button>
            );
          })}
        </div>

        {visibleIdeas.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Lightbulb className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Aucune idée dans cette catégorie. À vous de jouer !</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleIdeas.map((idea) => {
              const st = IDEA_STATUS[idea.status];
              const mine = idea.user_id === user?.id;
              return (
                <Card key={idea.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{idea.title}</p>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{idea.description}</p>
                        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {names[idea.user_id] ?? "Membre"}
                          {mine && <Badge variant="outline">Moi</Badge>}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant={myVotes.has(idea.id) ? "default" : "outline"}
                          size="sm"
                          className="h-8"
                          onClick={() => toggleVote(idea.id)}
                        >
                          <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                          {idea.votes}
                        </Button>
                        {(isCommittee || mine) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteIdea(idea.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {isCommittee && (
                      <div className="mt-3 flex flex-wrap gap-1 border-t pt-2">
                        {STATUS_ORDER.map((s) => (
                          <Button
                            key={s}
                            variant={idea.status === s ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setStatus(idea.id, s)}
                          >
                            {IDEA_STATUS[s].label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proposer une idée</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Titre</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Ex. : Organiser un tournoi des familles" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={4}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Décrivez votre idée, ce qu'elle apporterait au club…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={createIdea}>Proposer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ClubPageShell>
  );
}