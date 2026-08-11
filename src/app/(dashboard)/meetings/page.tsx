"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTeam } from "@/lib/team";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Loader2,
  MapPin,
  PenLine,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { authFetch } from "@/lib/api-client";
import { SignaturePad } from "@/components/meetings/SignaturePad";
import { toast } from "sonner";
import type { ParentMeeting, MeetingSignature } from "@/types";

export default function MeetingsPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isCoach = userRole === "coach" || userRole === "owner";
  const [meetings, setMeetings] = useState<ParentMeeting[]>([]);
  const [signatures, setSignatures] = useState<MeetingSignature[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const [agendaFor, setAgendaFor] = useState<ParentMeeting | null>(null);
  const [agendaItem, setAgendaItem] = useState("");
  const [minutesFor, setMinutesFor] = useState<ParentMeeting | null>(null);
  const [minuteLabel, setMinuteLabel] = useState("");
  const [minuteContent, setMinuteContent] = useState("");
  const [signFor, setSignFor] = useState<ParentMeeting | null>(null);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const [meetRes, signRes] = await Promise.all([
      supabase.from("parent_meetings").select("*").eq("team_id", currentTeam!.id).order("meeting_date", { ascending: false }),
      supabase.from("meeting_signatures").select("*").eq("team_id", currentTeam!.id),
    ]);
    return {
      meetings: (meetRes.data || []) as ParentMeeting[],
      signatures: (signRes.data || []) as MeetingSignature[],
    };
  }, [currentTeam]);

  useEffect(() => {
    if (!currentTeam) return;
    loadData().then((res) => {
      setMeetings(res.meetings);
      setSignatures(res.signatures);
      setLoading(false);
    });
  }, [currentTeam, loadData]);

  async function createMeeting() {
    if (!title.trim()) {
      toast.error("Titre requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("parent_meetings")
        .insert({
          team_id: currentTeam!.id,
          title: title.trim(),
          description: description.trim() || null,
          meeting_date: meetingDate ? new Date(`${meetingDate}T${meetingTime || "19:00"}:00`).toISOString() : null,
          location: location.trim() || null,
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      setMeetings((prev) => [data as ParentMeeting, ...prev]);
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setMeetingDate("");
      setMeetingTime("");
      setLocation("");
      toast.success("Réunion créée");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function patchMeeting(id: string, patch: Record<string, unknown>) {
    const supabase = createClient();
    const { data, error } = await supabase.from("parent_meetings").update(patch).eq("id", id).select("*").single();
    if (error) {
      toast.error(String(error.message));
      return null;
    }
    setMeetings((prev) => prev.map((m) => (m.id === id ? (data as ParentMeeting) : m)));
    return data as ParentMeeting;
  }

  async function addAgendaItem() {
    if (!agendaFor || !agendaItem.trim()) return;
    const next = [...agendaFor.agenda, { label: agendaItem.trim() }];
    await patchMeeting(agendaFor.id, { agenda: next });
    setAgendaItem("");
    setAgendaFor((prev) => (prev ? { ...prev, agenda: next } : prev));
  }

  async function removeAgendaItem(idx: number) {
    if (!agendaFor) return;
    const next = agendaFor.agenda.filter((_, i) => i !== idx);
    await patchMeeting(agendaFor.id, { agenda: next });
    setAgendaFor({ ...agendaFor, agenda: next });
  }

  async function addMinute() {
    if (!minutesFor || !minuteLabel.trim() || !minuteContent.trim()) return;
    const next = [...minutesFor.minutes, { label: minuteLabel.trim(), content: minuteContent.trim() }];
    await patchMeeting(minutesFor.id, { minutes: next });
    setMinuteLabel("");
    setMinuteContent("");
    setMinutesFor((prev) => (prev ? { ...prev, minutes: next } : prev));
  }

  async function removeMinute(idx: number) {
    if (!minutesFor) return;
    const next = minutesFor.minutes.filter((_, i) => i !== idx);
    await patchMeeting(minutesFor.id, { minutes: next });
    setMinutesFor({ ...minutesFor, minutes: next });
  }

  async function notifyMeeting(meeting: ParentMeeting) {
    setNotifyingId(meeting.id);
    try {
      const supabase = createClient();
      const [membersRes, linksRes] = await Promise.all([
        supabase.from("team_members").select("user_id").eq("team_id", currentTeam!.id).eq("role", "parent"),
        supabase.from("parent_student").select("parent_id").eq("team_id", currentTeam!.id),
      ]);
      const parentIds = [
        ...new Set([
          ...(membersRes.data || []).map((m) => (m as { user_id: string }).user_id),
          ...(linksRes.data || []).map((l) => (l as { parent_id: string }).parent_id),
        ]),
      ];
      if (parentIds.length === 0) {
        toast.error("Aucun parent dans l'équipe");
        return;
      }
      const dateStr = meeting.meeting_date
        ? new Date(meeting.meeting_date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })
        : "";
      await authFetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_ids: parentIds,
          title: `Réunion parents : ${meeting.title}`,
          body: `${dateStr ? "📅 " + dateStr + " · " : ""}${meeting.location ? "📍 " + meeting.location + " · " : ""}Votre présence est attendue.`,
          type: "reunion",
          reference_id: meeting.id,
          team_id: currentTeam!.id,
          url: "/meetings",
        }),
      });
      toast.success("Convocation envoyée aux parents");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setNotifyingId(null);
    }
  }

  async function signMeeting(meeting: ParentMeeting, dataUrl: string) {
    if (!user) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("meeting_signatures")
        .upsert(
          {
            meeting_id: meeting.id,
            team_id: currentTeam!.id,
            member_id: user.id,
            member_name: `${(user.profile as { first_name?: string })?.first_name ?? ""} ${(user.profile as { last_name?: string })?.last_name ?? ""}`.trim() || "Membre",
            signature_data: dataUrl,
          },
          { onConflict: "meeting_id,member_id" }
        )
        .select("*")
        .single();
      if (error) throw error;
      setSignatures((prev) => [...prev.filter((s) => !(s.meeting_id === meeting.id && s.member_id === user.id)), data as MeetingSignature]);
      setSignFor(null);
      toast.success("Signature enregistrée");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!currentTeam) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Chargement...</p></div>;
  }

  const signers = (meetingId: string) => signatures.filter((s) => s.meeting_id === meetingId);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--color-gold)]" />
            Réunions parents
          </h1>
          <p className="text-sm text-muted-foreground">Convocation, ordre du jour, compte-rendu et signature électronique.</p>
        </div>
        {isCoach && (
          <Button size="sm" className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Nouvelle réunion
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Aucune réunion programmée. Le coach peut en créer une.
          </CardContent>
        </Card>
      ) : (
        meetings.map((m) => {
          const sigs = signers(m.id);
          const mySig = user ? sigs.find((s) => s.member_id === user.id) : null;
          return (
            <Card key={m.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{m.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {m.meeting_date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {new Date(m.meeting_date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}{" "}
                          à {new Date(m.meeting_date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {m.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {m.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className={m.status === "done" ? "bg-green-100 text-green-700 border-green-200" : m.status === "cancelled" ? "bg-red-100 text-red-700 border-red-200" : "bg-blue-100 text-blue-700 border-blue-200"}>
                    {m.status === "done" ? "Terminée" : m.status === "cancelled" ? "Annulée" : "Prévue"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}

                {/* Ordre du jour */}
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
                    <ClipboardList className="h-3.5 w-3.5 text-[var(--color-gold)]" />
                    Ordre du jour
                  </p>
                  {m.agenda.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun point défini.</p>
                  ) : (
                    <ol className="space-y-1 list-decimal list-inside">
                      {m.agenda.map((item, i) => (
                        <li key={i} className="text-sm flex items-center justify-between gap-2">
                          <span>{item.label}</span>
                          {isCoach && (
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => removeAgendaItem(i)}>
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  {isCoach && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Ajouter un point à l'ordre du jour"
                        value={agendaFor?.id === m.id ? agendaItem : ""}
                        onChange={(e) => {
                          setAgendaFor(m);
                          setAgendaItem(e.target.value);
                        }}
                        className="text-sm h-8"
                      />
                      <Button size="sm" className="h-8 text-xs" onClick={addAgendaItem} disabled={!agendaItem.trim()}>
                        Ajouter
                      </Button>
                    </div>
                  )}
                </div>

                {/* Compte-rendu */}
                {m.status === "done" && (
                  <div className="rounded-lg bg-muted/40 p-3">
                    <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
                      <PenLine className="h-3.5 w-3.5 text-[var(--color-gold)]" />
                      Compte-rendu
                    </p>
                    {m.minutes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Compte-rendu à rédiger.</p>
                    ) : (
                      <div className="space-y-2">
                        {m.minutes.map((min, i) => (
                          <div key={i} className="flex items-start justify-between gap-2">
                            <div className="text-sm">
                              <p className="font-medium">{min.label}</p>
                              <p className="text-muted-foreground text-xs whitespace-pre-wrap">{min.content}</p>
                            </div>
                            {isCoach && (
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0" onClick={() => removeMinute(i)}>
                                <Trash2 className="h-3 w-3 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {isCoach && (
                      <div className="space-y-2 mt-2">
                        <Input placeholder="Point du compte-rendu" value={minutesFor?.id === m.id ? minuteLabel : ""} onChange={(e) => { setMinutesFor(m); setMinuteLabel(e.target.value); }} className="text-sm h-8" />
                        <Textarea placeholder="Contenu du point..." value={minutesFor?.id === m.id ? minuteContent : ""} onChange={(e) => { setMinutesFor(m); setMinuteContent(e.target.value); }} className="text-sm" rows={2} />
                        <Button size="sm" className="h-8 text-xs" onClick={addMinute} disabled={!minuteLabel.trim() || !minuteContent.trim()}>
                          Ajouter au compte-rendu
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Signatures */}
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-green-600" />
                    Présences signées ({sigs.length})
                  </p>
                  {sigs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {sigs.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg bg-white border px-2 py-1">
                          <img src={s.signature_data} alt="signature" className="h-8 w-20 object-contain" />
                          <div className="text-xs">
                            <p className="font-medium">{s.member_name}</p>
                            <p className="text-muted-foreground">{new Date(s.signed_at).toLocaleDateString("fr-FR")}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!mySig ? (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setSignFor(m)}>
                      Signer la feuille de présence
                    </Button>
                  ) : (
                    <p className="text-xs text-green-600 font-medium">✓ Vous avez signé.</p>
                  )}
                </div>

                {/* Actions coach */}
                {isCoach && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => notifyMeeting(m)} disabled={notifyingId === m.id}>
                      {notifyingId === m.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Users className="h-3 w-3 mr-1" />}
                      Convoquer les parents
                    </Button>
                    {m.status !== "done" && (
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => patchMeeting(m.id, { status: "done" })} disabled={updatingId === m.id}>
                        <Check className="h-3 w-3 mr-1" />
                        Marquer terminée
                      </Button>
                    )}
                    {m.status !== "cancelled" && (
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-red-600" onClick={() => patchMeeting(m.id, { status: "cancelled" })}>
                        Annuler la réunion
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle réunion parents</DialogTitle>
            <DialogDescription>Le coach programme la réunion, l&apos;ordre du jour vient ensuite.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Titre</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Réunion de rentrée" className="text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm mt-1" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Date</Label>
                <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Heure</Label>
                <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} className="text-sm mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Lieu</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Maison du club" className="text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button size="sm" onClick={createMeeting} disabled={saving || !title.trim()}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature */}
      <Dialog open={!!signFor} onOpenChange={(o) => !o && setSignFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signer la feuille de présence</DialogTitle>
            <DialogDescription>{signFor?.title}</DialogDescription>
          </DialogHeader>
          <SignaturePad onSave={(dataUrl) => signFor && signMeeting(signFor, dataUrl)} onCancel={() => setSignFor(null)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
