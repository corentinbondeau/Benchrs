"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Calculator,
  Scale,
  CalendarCheck,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

interface Meeting {
  id: string;
  title: string;
  meeting_date: string | null;
  start_time: string | null;
  location: string | null;
  status: "planned" | "held" | "cancelled";
  agenda: string[];
  created_at: string;
}
interface Decision {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  outcome: "proposed" | "adopted" | "rejected";
  created_at: string;
}
interface Vote {
  id: string;
  decision_id: string;
  user_id: string;
  choice: "pour" | "contre" | "abstention";
}

type VoteChoice = "pour" | "contre" | "abstention";

export default function ClubBureauPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [agendaText, setAgendaText] = useState("");

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionMeeting, setDecisionMeeting] = useState<Meeting | null>(null);
  const [decTitle, setDecTitle] = useState("");
  const [decDescription, setDecDescription] = useState("");

  const load = useCallback(async (cid: string) => {
    const { data: meetingsData } = await supabaseRef.current
      .from("board_meetings")
      .select("*")
      .eq("club_id", cid)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    const meetingRows = ((meetingsData || []) as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      title: m.title as string,
      meeting_date: (m.meeting_date as string | null) ?? null,
      start_time: (m.start_time as string | null) ?? null,
      location: (m.location as string | null) ?? null,
      status: m.status as Meeting["status"],
      agenda: (m.agenda as string[]) || [],
      created_at: m.created_at as string,
    }));

    let decisionRows: Decision[] = [];
    let voteRows: Vote[] = [];
    if (meetingRows.length > 0) {
      const ids = meetingRows.map((m) => m.id);
      const { data: decisionsData } = await supabaseRef.current
        .from("board_decisions")
        .select("*")
        .in("meeting_id", ids)
        .order("created_at", { ascending: true });
      decisionRows = ((decisionsData || []) as Record<string, unknown>[]).map((d) => ({
        id: d.id as string,
        meeting_id: d.meeting_id as string,
        title: d.title as string,
        description: (d.description as string | null) ?? null,
        outcome: d.outcome as Decision["outcome"],
        created_at: d.created_at as string,
      }));
      if (decisionRows.length > 0) {
        const { data: votesData } = await supabaseRef.current
          .from("board_votes")
          .select("*")
          .in(
            "decision_id",
            decisionRows.map((d) => d.id)
          );
        voteRows = ((votesData || []) as Record<string, unknown>[]).map((v) => ({
          id: v.id as string,
          decision_id: v.decision_id as string,
          user_id: v.user_id as string,
          choice: v.choice as VoteChoice,
        }));
      }
    }
    return { meetings: meetingRows, decisions: decisionRows, votes: voteRows };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setMeetings(res.meetings);
      setDecisions(res.decisions);
      setVotes(res.votes);
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
        setMeetings(res.meetings);
        setDecisions(res.decisions);
        setVotes(res.votes);
      });
    }
  }

  async function saveMeeting() {
    if (!clubId || !user || !title.trim()) {
      toast.error("Titre requis");
      return;
    }
    const agendaItems = agendaText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const payload = {
      title: title.trim(),
      meeting_date: meetingDate || null,
      start_time: startTime || null,
      location: location.trim() || null,
      agenda: agendaItems,
    };
    const res = editing
      ? await supabaseRef.current
          .from("board_meetings")
          .update(payload)
          .eq("id", editing.id)
          .eq("club_id", clubId)
      : await supabaseRef.current
          .from("board_meetings")
          .insert({ ...payload, club_id: clubId, created_by: user.id });
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(editing ? "Réunion mise à jour" : "Réunion créée");
    setCreateOpen(false);
    setEditing(null);
    setTitle("");
    setMeetingDate("");
    setStartTime("");
    setLocation("");
    setAgendaText("");
    refresh();
  }

  async function setMeetingStatus(meeting: Meeting, status: Meeting["status"]) {
    const { error } = await supabaseRef.current
      .from("board_meetings")
      .update({ status })
      .eq("id", meeting.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function deleteMeeting(meeting: Meeting) {
    if (!confirm(`Supprimer la réunion « ${meeting.title} » ?`)) return;
    const { error } = await supabaseRef.current
      .from("board_meetings")
      .delete()
      .eq("id", meeting.id)
      .eq("club_id", clubId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  function openCreate() {
    setEditing(null);
    setTitle("");
    setMeetingDate("");
    setStartTime("");
    setLocation("");
    setAgendaText("");
    setCreateOpen(true);
  }
  function openEdit(meeting: Meeting) {
    setEditing(meeting);
    setTitle(meeting.title);
    setMeetingDate(meeting.meeting_date ?? "");
    setStartTime(meeting.start_time ? meeting.start_time.slice(0, 5) : "");
    setLocation(meeting.location ?? "");
    setAgendaText(meeting.agenda.join("\n"));
    setCreateOpen(true);
  }

  async function saveDecision() {
    if (!decisionMeeting || !user || !decTitle.trim()) {
      toast.error("Titre requis");
      return;
    }
    const { error } = await supabaseRef.current.from("board_decisions").insert({
      meeting_id: decisionMeeting.id,
      title: decTitle.trim(),
      description: decDescription.trim() || null,
      created_by: user.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setDecisionOpen(false);
    setDecisionMeeting(null);
    setDecTitle("");
    setDecDescription("");
    refresh();
  }

  async function setOutcome(decision: Decision, outcome: Decision["outcome"]) {
    const { error } = await supabaseRef.current
      .from("board_decisions")
      .update({ outcome })
      .eq("id", decision.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function deleteDecision(decision: Decision) {
    const { error } = await supabaseRef.current
      .from("board_decisions")
      .delete()
      .eq("id", decision.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function vote(decisionId: string, choice: VoteChoice) {
    if (!user) return;
    const existing = votes.find((v) => v.decision_id === decisionId && v.user_id === user.id);
    const { error } = existing
      ? await supabaseRef.current.from("board_votes").update({ choice }).eq("id", existing.id).eq("user_id", user.id)
      : await supabaseRef.current.from("board_votes").insert({ decision_id: decisionId, user_id: user.id, choice });
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  function votesFor(decisionId: string) {
    const dv = votes.filter((v) => v.decision_id === decisionId);
    return {
      pour: dv.filter((v) => v.choice === "pour").length,
      contre: dv.filter((v) => v.choice === "contre").length,
      abstention: dv.filter((v) => v.choice === "abstention").length,
      mine: dv.find((v) => v.user_id === user?.id)?.choice ?? null,
    };
  }

  const meetingDecisions = (meetingId: string) =>
    decisions.filter((d) => d.meeting_id === meetingId);

  function openDecision(meeting: Meeting) {
    setDecisionMeeting(meeting);
    setDecTitle("");
    setDecDescription("");
    setDecisionOpen(true);
  }

  return (
    <ClubPageShell
      title="Réunions du bureau"
      subtitle="Convocations, ordre du jour et relevé de décisions"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || (clubId ? pageLoading : false)}
      actions={
        isCommittee ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouvelle réunion
          </Button>
        ) : undefined
      }
    >
      <Dialog open={createOpen} onOpenChange={(v) => !v && setCreateOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[var(--color-royal)]" />
              {editing ? "Modifier la réunion" : "Nouvelle réunion du bureau"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="br-title">Titre</Label>
              <Input
                id="br-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex. : Réunion de préparation de saison"
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="br-date">Date</Label>
                <Input id="br-date" type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-time">Heure</Label>
                <Input id="br-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-location">Lieu</Label>
              <Input
                id="br-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex. : Club-house"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-agenda">Ordre du jour (une ligne par point)</Label>
              <textarea
                id="br-agenda"
                value={agendaText}
                onChange={(e) => setAgendaText(e.target.value)}
                placeholder={"Budget fournitures\nEffectifs et licences\nTournoi de printemps"}
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Annuler
              </Button>
              <Button onClick={saveMeeting} disabled={!title.trim()}>
                {editing ? "Enregistrer" : "Créer"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={decisionOpen} onOpenChange={(v) => !v && setDecisionOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-[var(--color-royal)]" />
              Nouvelle décision
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="dec-title">Intitulé</Label>
              <Input
                id="dec-title"
                value={decTitle}
                onChange={(e) => setDecTitle(e.target.value)}
                placeholder="Ex. : Validation du budget fournitures"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dec-desc">Détails (optionnel)</Label>
              <textarea
                id="dec-desc"
                value={decDescription}
                onChange={(e) => setDecDescription(e.target.value)}
                rows={3}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDecisionOpen(false)}>
                Annuler
              </Button>
              <Button onClick={saveDecision} disabled={!decTitle.trim()}>
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {meetings.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucune réunion pour le moment.
            </CardContent>
          </Card>
        )}
        {meetings.map((meeting) => {
          const mDecisions = meetingDecisions(meeting.id);
          const held = meeting.status === "held";
          const active = meeting.status === "planned";
          return (
            <Card key={meeting.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{meeting.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge variant={held ? "default" : meeting.status === "cancelled" ? "outline" : "secondary"}>
                        {held ? <CalendarCheck className="h-3 w-3 mr-1" /> : null}
                        {held ? "Tenue" : meeting.status === "cancelled" ? "Annulée" : "Planifiée"}
                      </Badge>
                      {meeting.meeting_date && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(meeting.meeting_date + "T00:00:00").toLocaleDateString("fr-FR", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                          {meeting.start_time ? ` à ${meeting.start_time.slice(0, 5)}` : ""}
                        </span>
                      )}
                      {meeting.location && (
                        <span className="text-xs text-muted-foreground">· {meeting.location}</span>
                      )}
                    </div>
                  </div>
                  {isCommittee && (
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {active && (
                        <Button variant="outline" size="sm" onClick={() => setMeetingStatus(meeting, "held")}>
                          <CalendarCheck className="h-3 w-3 mr-1" />
                          Tenue
                        </Button>
                      )}
                      {/* Keep: status revert accessible via edit? */}
                      {meeting.status === "cancelled" && (
                        <Button variant="outline" size="sm" onClick={() => setMeetingStatus(meeting, "planned")}>
                          Réactiver
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(meeting)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteMeeting(meeting)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {meeting.agenda.length > 0 && (
                  <ol className="mt-2 space-y-0.5 list-decimal list-inside text-sm text-muted-foreground">
                    {meeting.agenda.map((point, idx) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ol>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                {mDecisions.length === 0 && (
                  <>
                    {held ? (
                      <p className="text-sm text-muted-foreground">Aucune décision enregistrée.</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Les décisions apparaîtront après la tenue de la réunion.
                      </p>
                    )}
                  </>
                )}
                {mDecisions.map((d) => {
                  const v = votesFor(d.id);
                  return (
                    <div key={d.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{d.title}</p>
                          {d.description && <p className="text-sm text-muted-foreground mt-0.5">{d.description}</p>}
                          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>Pour : <b className="text-foreground">{v.pour}</b></span>
                            <span>Contre : <b className="text-foreground">{v.contre}</b></span>
                            <span>Abstention : <b className="text-foreground">{v.abstention}</b></span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 shrink-0 items-center">
                          <Badge
                            variant={d.outcome === "adopted" ? "default" : d.outcome === "rejected" ? "destructive" : "secondary"}
                          >
                            {d.outcome === "adopted" ? (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            ) : d.outcome === "rejected" ? (
                              <XCircle className="h-3 w-3 mr-1" />
                            ) : (
                              <Calculator className="h-3 w-3 mr-1" />
                            )}
                            {d.outcome === "adopted" ? "Adoptée" : d.outcome === "rejected" ? "Rejetée" : "À vote"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {isCommittee && d.outcome === "proposed" && (
                          <>
                            <VoteChip
                              label="Pour"
                              active={v.mine === "pour"}
                              onClick={() => vote(d.id, "pour")}
                            />
                            <VoteChip
                              label="Contre"
                              active={v.mine === "contre"}
                              onClick={() => vote(d.id, "contre")}
                            />
                            <VoteChip
                              label="S'abstenir"
                              active={v.mine === "abstention"}
                              onClick={() => vote(d.id, "abstention")}
                            />
                          </>
                        )}
                        {isCommittee && d.outcome === "proposed" && v.mine && (
                          <span className="text-xs text-muted-foreground">Votre vote : {v.mine}</span>
                        )}
                        {isCommittee && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setOutcome(d, d.outcome === "adopted" ? "proposed" : "adopted")}
                            >
                              {d.outcome === "adopted" ? "Rouvrir" : "Adopter"}
                            </Button>
                            {d.outcome !== "adopted" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setOutcome(d, d.outcome === "rejected" ? "proposed" : "rejected")}
                              >
                                {d.outcome === "rejected" ? "Rouvrir" : "Rejeter"}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteDecision(d)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {held && isCommittee && (
                  <Button variant="outline" size="sm" onClick={() => openDecision(meeting)}>
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    Ajouter une décision
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ClubPageShell>
  );
}

function VoteChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-[var(--color-royal)] bg-[var(--color-royal)]/10 text-[var(--color-royal)] font-medium"
          : "border-border hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}