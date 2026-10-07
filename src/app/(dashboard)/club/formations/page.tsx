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
import { GraduationCap, Plus, Pencil, Trash2, BellRing, Award } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/api-client";

type QualType = "bmf" | "be" | "uefa_b" | "uefa_a" | "bafa" | "psc1" | "autre";
const QUAL_LABELS: Record<QualType, string> = {
  bmf: "BMF",
  be: "BE",
  uefa_b: "UEFA B",
  uefa_a: "UEFA A",
  bafa: "BAFA",
  psc1: "PSC1",
  autre: "Autre",
};

interface StaffMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: "coach" | "owner" | "comite";
}
interface Qualification {
  id: string;
  user_id: string;
  qualification: QualType;
  label: string | null;
  issued_at: string | null;
  expires_at: string | null;
  notes: string | null;
}

export default function ClubFormationsPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [quals, setQuals] = useState<Qualification[]>([]);
  const [reminding, setReminding] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Qualification | null>(null);
  const [memberId, setMemberId] = useState("");
  const [qualType, setQualType] = useState<QualType>("bmf");
  const [label, setLabel] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async (cid: string) => {
    const { data: teamsData } = await supabaseRef.current
      .from("teams")
      .select("id")
      .eq("club_id", cid);
    const teamIds = ((teamsData || []) as { id: string }[]).map((t) => t.id);

    const tms =
      teamIds.length > 0
        ? (await supabaseRef.current
            .from("team_members")
            .select("user_id, role")
            .in("team_id", teamIds)
            .in("role", ["coach", "owner"])).data || []
        : [];
    const cm = (
      await supabaseRef.current
        .from("club_members")
        .select("user_id")
        .eq("club_id", cid)
        .eq("role", "comite")
    ).data || [];

    const roleMap = new Map<string, StaffMember["role"]>();
    for (const m of tms as { user_id: string; role: string }[]) {
      if (!roleMap.has(m.user_id)) roleMap.set(m.user_id, m.role === "owner" ? "owner" : "coach");
    }
    for (const m of cm as { user_id: string }[]) {
      if (!roleMap.has(m.user_id)) roleMap.set(m.user_id, "comite");
    }
    const memberIds = [...roleMap.keys()];

    const [{ data: profiles }, { data: qualsData }] = await Promise.all([
      memberIds.length > 0
        ? supabaseRef.current.from("profiles").select("id, first_name, last_name").in("id", memberIds)
        : Promise.resolve({ data: [] }),
      supabaseRef.current
        .from("staff_qualifications")
        .select("*")
        .eq("club_id", cid)
        .order("created_at", { ascending: false }),
    ]);

    const staffRows: StaffMember[] = ((profiles || []) as { id: string; first_name: string | null; last_name: string | null }[])
      .map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        role: roleMap.get(p.id) ?? "comite",
      }))
      .sort((a, b) =>
        `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(
          `${b.last_name ?? ""} ${b.first_name ?? ""}`,
          "fr"
        )
      );

    const qualRows: Qualification[] = ((qualsData || []) as Record<string, unknown>[]).map((q) => ({
      id: q.id as string,
      user_id: q.user_id as string,
      qualification: (q.qualification as QualType) ?? "autre",
      label: (q.label as string | null) ?? null,
      issued_at: (q.issued_at as string | null) ?? null,
      expires_at: (q.expires_at as string | null) ?? null,
      notes: (q.notes as string | null) ?? null,
    }));

    return { staff: staffRows, quals: qualRows };
  }, []);

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setStaff(res.staff);
      setQuals(res.quals);
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
        setStaff(res.staff);
        setQuals(res.quals);
      });
    }
  }

  const memberName = (id: string) => {
    const m = staff.find((s) => s.id === id);
    return m ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || "Membre" : "Membre";
  };

  function openCreate() {
    setEditing(null);
    setMemberId("");
    setQualType("bmf");
    setLabel("");
    setIssuedAt("");
    setExpiresAt("");
    setNotes("");
    setDialogOpen(true);
  }
  function openEdit(q: Qualification) {
    setEditing(q);
    setMemberId(q.user_id);
    setQualType(q.qualification);
    setLabel(q.label ?? "");
    setIssuedAt(q.issued_at ?? "");
    setExpiresAt(q.expires_at ?? "");
    setNotes(q.notes ?? "");
    setDialogOpen(true);
  }

  async function saveQual() {
    if (!clubId || !user || !memberId) {
      toast.error("Membre requis");
      return;
    }
    const payload = {
      user_id: memberId,
      qualification: qualType,
      label: qualType === "autre" ? (label.trim() || null) : null,
      issued_at: issuedAt || null,
      expires_at: expiresAt || null,
      notes: notes.trim() || null,
    };
    const res = editing
      ? await supabaseRef.current
          .from("staff_qualifications")
          .update(payload)
          .eq("id", editing.id)
      : await supabaseRef.current
          .from("staff_qualifications")
          .insert({ ...payload, club_id: clubId, created_by: user.id });
    if (res.error) {
      toast.error(res.error.message);
      return;
    }
    toast.success(editing ? "Qualification mise à jour" : "Qualification ajoutée");
    setDialogOpen(false);
    setEditing(null);
    refresh();
  }

  async function deleteQual(q: Qualification) {
    if (!confirm("Supprimer cette qualification ?")) return;
    const { error } = await supabaseRef.current
      .from("staff_qualifications")
      .delete()
      .eq("id", q.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  async function remind(q: Qualification) {
    if (!clubId) return;
    setReminding(q.id);
    try {
      const res = await authFetch("/api/clubs/qualification-remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, userId: q.user_id, qualification: q.qualification, expiresAt: q.expires_at }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      toast.success("Rappel envoyé à l'encadrant");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setReminding(null);
    }
  }

  const now = new Date();
  const in60Days = new Date(now.getTime() + 60 * 24 * 3600 * 1000);
  function statusOf(q: Qualification): { tone: "ok" | "warn" | "expired"; label: string } {
    if (!q.expires_at) return { tone: "ok", label: "Sans échéance" };
    const d = new Date(q.expires_at + "T00:00:00");
    if (d < now) return { tone: "expired", label: "Expiré" };
    if (d < in60Days) return { tone: "warn", label: `Échéance ${d.toLocaleDateString("fr-FR")}` };
    return { tone: "ok", label: `Valide jusqu'au ${d.toLocaleDateString("fr-FR")}` };
  }

  const grouped = [...new Set(quals.map((q) => q.user_id))];

  return (
    <ClubPageShell
      title="Diplômes & formations"
      subtitle="Diplômes de l'encadrement (BMF, BE, UEFA…) et alertes d'échéance"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || (clubId ? pageLoading : false)}
      actions={
        isCommittee ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Ajouter un diplôme
          </Button>
        ) : undefined
      }
    >
      <Dialog open={dialogOpen} onOpenChange={(v) => !v && setDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-[var(--color-royal)]" />
              {editing ? "Modifier un diplôme" : "Ajouter un diplôme"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="qf-member">Encadrant</Label>
              <Select value={memberId} onValueChange={(v) => setMemberId(v ?? "")}>
                <SelectTrigger id="qf-member" className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {memberName(s.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qf-type">Diplôme</Label>
              <Select value={qualType} onValueChange={(v) => setQualType((v ?? "bmf") as QualType)}>
                <SelectTrigger id="qf-type" className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(QUAL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {qualType === "autre" && (
              <div className="space-y-1.5">
                <Label htmlFor="qf-label">Intitulé</Label>
                <Input id="qf-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="qf-issued">Obtenu le</Label>
                <Input id="qf-issued" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qf-expires">Échéance</Label>
                <Input id="qf-expires" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qf-notes">Notes (optionnel)</Label>
              <Input id="qf-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={saveQual} disabled={!memberId}>
                {editing ? "Enregistrer" : "Ajouter"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {grouped.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Aucun diplôme enregistré.
            </CardContent>
          </Card>
        )}
        {grouped.map((uid) => {
          const memberQuals = quals.filter((q) => q.user_id === uid);
          return (
            <Card key={uid}>
              <CardContent className="py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="h-4 w-4 text-[var(--color-royal)]" />
                  <p className="font-semibold text-sm">{memberName(uid)}</p>
                </div>
                <div className="space-y-2">
                  {memberQuals.map((q) => {
                    const st = statusOf(q);
                    const display = q.qualification === "autre" ? q.label || "Autre" : QUAL_LABELS[q.qualification];
                    return (
                      <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{display}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <Badge
                              variant={st.tone === "expired" ? "destructive" : st.tone === "warn" ? "secondary" : "outline"}
                            >
                              {st.label}
                            </Badge>
                            {q.issued_at && <span>Obtenu le {new Date(q.issued_at + "T00:00:00").toLocaleDateString("fr-FR")}</span>}
                            {q.notes && <span>· {q.notes}</span>}
                          </div>
                        </div>
                        {isCommittee && (
                          <div className="flex gap-1 shrink-0">
                            <Button variant="outline" size="sm" onClick={() => remind(q)} disabled={reminding === q.id}>
                              <BellRing className="h-3 w-3 mr-1" />
                              Rappeler
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteQual(q)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ClubPageShell>
  );
}