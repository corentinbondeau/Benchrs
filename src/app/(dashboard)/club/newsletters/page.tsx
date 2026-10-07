"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { Megaphone, Plus, Send, Ban, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";

interface Newsletter {
  id: string;
  title: string;
  content: string;
  audience: "all" | "team";
  team_id: string | null;
  status: "scheduled" | "sent" | "cancelled";
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
}
interface Team {
  id: string;
  name: string;
}

export default function ClubNewslettersPage() {
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState<"all" | "team">("all");
  const [teamId, setTeamId] = useState<string>("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (cid: string) => {
    const [{ data: nlData }, { data: teamsData }] = await Promise.all([
      supabaseRef.current
        .from("club_newsletters")
        .select("*")
        .eq("club_id", cid)
        .order("created_at", { ascending: false }),
      supabaseRef.current.from("teams").select("id, name").eq("club_id", cid).order("name", { ascending: true }),
    ]);
    const rows = ((nlData || []) as Record<string, unknown>[]).map((n) => ({
      id: n.id as string,
      title: n.title as string,
      content: n.content as string,
      audience: (n.audience as "all" | "team") ?? "all",
      team_id: (n.team_id as string | null) ?? null,
      status: (n.status as Newsletter["status"]) ?? "scheduled",
      scheduled_for: (n.scheduled_for as string | null) ?? null,
      sent_at: (n.sent_at as string | null) ?? null,
      created_at: n.created_at as string,
    }));
    return {
      newsletters: rows,
      teams: ((teamsData || []) as { id: string; name: string }[]).map((t) => ({
        id: t.id,
        name: t.name,
      })),
    };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setNewsletters(res.newsletters);
      setTeams(res.teams);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  function refresh() {
    if (clubId) {
      load(clubId).then((res) => {
        setNewsletters(res.newsletters);
        setTeams(res.teams);
      });
    }
  }

  async function sendNewsletter() {
    if (!clubId) return;
    if (!title.trim() || !content.trim()) {
      toast.error("Titre et contenu requis");
      return;
    }
    setSending(true);
    try {
      const res = await authFetch("/api/clubs/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          title: title.trim(),
          content: content.trim(),
          audience,
          teamId: audience === "team" ? teamId || null : null,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast.success(
        data.newsletter?.status === "sent"
          ? "Newsletter envoyée"
          : `Programmée pour ${new Date(scheduledFor).toLocaleString("fr-FR")}`
      );
      setCreateOpen(false);
      setTitle("");
      setContent("");
      setAudience("all");
      setTeamId("");
      setScheduledFor("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  }

  async function cancelNewsletter(n: Newsletter) {
    const { error } = await supabaseRef.current
      .from("club_newsletters")
      .update({ status: "cancelled" })
      .eq("id", n.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Newsletter annulée");
    refresh();
  }

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "Équipe";
  const pending = newsletters.filter((n) => n.status === "scheduled");
  const sent = newsletters.filter((n) => n.status === "sent");

  return (
    <ClubPageShell
      title="Newsletters"
      subtitle="Lettre d'information aux familles — envoyer immédiatement ou programmer"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || (clubId ? pageLoading : false)}
      actions={
        isCommittee ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouvelle newsletter
          </Button>
        ) : undefined
      }
    >
      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-[var(--color-royal)]" />
              Nouvelle newsletter
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="nl-title">Titre</Label>
              <Input
                id="nl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. : Info club — mi-saison"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-content">Contenu</Label>
              <textarea
                id="nl-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={8}
                maxLength={8000}
                placeholder={"Résultats du week-end\nL'assemblée générale aura lieu le…\nPensez à régler les cotisations."}
                className="flex min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground text-right">{content.length}/8000</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nl-audience">Destinataires</Label>
              <Select value={audience} onValueChange={(v) => setAudience((v ?? "all") as "all" | "team")}>
                <SelectTrigger id="nl-audience" className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tout le club</SelectItem>
                  <SelectItem value="team">Une équipe seulement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audience === "team" && (
              <div className="space-y-1.5">
                <Label htmlFor="nl-team">Équipe</Label>
                <Select value={teamId} onValueChange={(v) => setTeamId(v ?? "")}>
                  <SelectTrigger id="nl-team" className="w-full h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="nl-schedule">Envoi programmé (optionnel — vide = envoyer maintenant)</Label>
              <Input
                id="nl-schedule"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button onClick={sendNewsletter} disabled={!title.trim() || !content.trim() || sending}>
                <Send className="h-3.5 w-3.5 mr-1" />
                {sending ? "Envoi…" : audience === "team" && !teamId ? "Cible l'équipe" : scheduledFor ? "Programmer" : "Envoyer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {pending.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Programmées</h2>
            <div className="space-y-3">
              {pending.map((n) => (
                <Card key={n.id}>
                  <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {n.audience === "team" ? `Équipe ${teamName(n.team_id)}` : "Tout le club"} · partira le{" "}
                        {n.scheduled_for ? new Date(n.scheduled_for).toLocaleString("fr-FR") : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Programmée</Badge>
                      <Button variant="outline" size="sm" onClick={() => cancelNewsletter(n)}>
                        <Ban className="h-3 w-3 mr-1" />
                        Annuler
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
            Envoyées ({sent.length})
          </h2>
          {sent.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Aucune newsletter envoyée pour le moment.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sent.map((n) => {
                const open = expanded === n.id;
                return (
                  <Card key={n.id}>
                    <CardHeader className="pb-2">
                      <button
                        className="w-full text-left flex items-start justify-between gap-2"
                        onClick={() => setExpanded(open ? null : n.id)}
                      >
                        <div>
                          <CardTitle className="text-base">{n.title}</CardTitle>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge variant="secondary">Envoyée</Badge>
                            <span className="text-xs text-muted-foreground">
                              {n.audience === "team" ? `Équipe ${teamName(n.team_id)}` : "Tout le club"}
                              {n.sent_at ? ` · ${new Date(n.sent_at).toLocaleString("fr-FR")}` : ""}
                            </span>
                          </div>
                        </div>
                        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                      </button>
                    </CardHeader>
                    {open && (
                      <CardContent>
                        <p className="text-sm whitespace-pre-line text-muted-foreground">{n.content}</p>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ClubPageShell>
  );
}