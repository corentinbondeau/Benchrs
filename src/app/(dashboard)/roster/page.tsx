"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import { Shield, Users, Baby, ChevronRight, FileText, Download, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Section = { key: "coach" | "player" | "parent"; label: string; icon: typeof Shield };

const SECTIONS: Section[] = [
  { key: "coach", label: "Coachs", icon: Shield },
  { key: "player", label: "Joueurs", icon: Users },
  { key: "parent", label: "Parents", icon: Baby },
];

type AddPlayerForm = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  position: string;
  shirtNumber: string;
  hasEmail: boolean;
  email: string;
};

import { POSITIONS } from "@/lib/positions";

export default function RosterPage() {
  const { user } = useAuth();
  const { currentTeam, userRole } = useTeam();
  const isOwner = userRole === "owner";
  const canAddPlayer = userRole === "owner" || userRole === "coach" || userRole === "parent";
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [memberIds, setMemberIds] = useState<Record<string, string>>({});
  const [muteStatuses, setMuteStatuses] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddPlayerForm>({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    position: "",
    shirtNumber: "",
    hasEmail: false,
    email: "",
  });
  const [addSaving, setAddSaving] = useState(false);

  useEffect(() => {
    if (!currentTeam) return;
    const supabase = createClient();

    async function loadMembers() {
      const { data: rows } = await supabase
        .from("team_members")
        .select("id, user_id, role, mute_status")
        .eq("team_id", currentTeam!.id);

      if (!rows || rows.length === 0) {
        setAllProfiles([]);
        setLoading(false);
        return;
      }

      const roleMap: Record<string, string> = {};
      const memberIdMap: Record<string, string> = {};
      const muteMap: Record<string, string | null> = {};
      for (const r of rows as { id: string; user_id: string; role: string; mute_status: string | null }[]) {
        roleMap[r.user_id] = r.role === "owner" ? "coach" : r.role;
        memberIdMap[r.user_id] = r.id;
        muteMap[r.user_id] = r.mute_status ?? null;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role, position, shirt_number, date_of_birth, phone, vma, vmi, avatar_url")
        .in("id", rows.map((r) => r.user_id))
        .order("last_name", { ascending: true });

      setAllProfiles(
        ((profiles as Profile[]) || []).map((p) => ({
          ...p,
          role: (roleMap[p.id] || p.role) as Profile["role"],
        }))
      );
      setMemberIds(memberIdMap);
      setMuteStatuses(muteMap);
      setLoading(false);
    }

    loadMembers();
  }, [currentTeam?.id]);

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTeam) return;
    setAddSaving(true);
    try {
      const res = await authFetch("/api/auth/create-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: currentTeam.id,
          firstName: addForm.firstName,
          lastName: addForm.lastName,
          dateOfBirth: addForm.dateOfBirth || undefined,
          position: addForm.position || undefined,
          shirtNumber: addForm.shirtNumber || undefined,
          email: addForm.hasEmail && addForm.email ? addForm.email : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erreur lors de la création du joueur");
        return;
      }
      toast.success("Joueur créé avec succès");
      setAddDialogOpen(false);
      setAddForm({ firstName: "", lastName: "", dateOfBirth: "", position: "", shirtNumber: "", hasEmail: false, email: "" });
      // Recharger la liste
      const supabase = createClient();
      const { data: rows } = await supabase
          .from("team_members")
          .select("id, user_id, role, mute_status")
          .eq("team_id", currentTeam.id);
      if (rows && rows.length > 0) {
        const roleMap: Record<string, string> = {};
        const memberIdMap: Record<string, string> = {};
        const muteMap: Record<string, string | null> = {};
        for (const r of rows as { id: string; user_id: string; role: string; mute_status: string | null }[]) {
          roleMap[r.user_id] = r.role === "owner" ? "coach" : r.role;
          memberIdMap[r.user_id] = r.id;
          muteMap[r.user_id] = r.mute_status ?? null;
        }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, role, position, shirt_number, date_of_birth, phone, vma, vmi, avatar_url")
          .in("id", rows.map((r) => r.user_id))
          .order("last_name", { ascending: true });
        setAllProfiles(
          ((profiles as Profile[]) || []).map((p) => ({
            ...p,
            role: (roleMap[p.id] || p.role) as Profile["role"],
          }))
        );
        setMemberIds(memberIdMap);
        setMuteStatuses(muteMap);
      }
    } catch {
      toast.error("Erreur de connexion au serveur");
    } finally {
      setAddSaving(false);
    }
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement de l&apos;équipe...</p>
      </div>
    );
  }

  function csvCell(value: string | number | null | undefined): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    if (allProfiles.length === 0) return;
    const rows: string[] = [
      "Nom;Prénom;Rôle;Poste;N°;Naissance;Téléphone;VMA;VMI",
    ];
    for (const p of allProfiles) {
      rows.push(
        [
          csvCell(p.last_name),
          csvCell(p.first_name),
          csvCell(p.role),
          csvCell(p.position || (p.role === "player" ? "Joueur" : "")),
          csvCell(p.shirt_number),
          csvCell(p.date_of_birth ? new Date(p.date_of_birth).toLocaleDateString("fr-FR") : ""),
          csvCell(p.phone),
          csvCell(p.vma),
          csvCell(p.vmi),
        ].join(";")
      );
    }
    const blob = new Blob(["\uFEFF" + rows.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `effectif-${currentTeam!.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!currentTeam) return;
    setExporting("pdf");
    try {
      const res = await authFetch("/api/export/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: currentTeam.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Export impossible");
      const byteString = atob((data.pdf as string).split(",")[1]);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `effectif-${currentTeam.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setExporting(null);
    }
  }

  const coaches = allProfiles.filter((p) => p.role === "coach");
  const players = allProfiles.filter((p) => p.role === "player");
  const parents = allProfiles.filter((p) => p.role === "parent");

  if (loading) {
    return (
      <div className="section-gap">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">{currentTeam.name}</p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  function RoleSection({ section }: { section: Section }) {
    const profiles = section.key === "coach" ? coaches : section.key === "player" ? players : parents;
    const Icon = section.icon;

    if (profiles.length === 0) return null;

    return (
      <div>
        <div className="flex items-center gap-2 pt-2 pb-3">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-widest">
            {section.label}
          </h3>
          <span className="text-[11px] text-muted-foreground/50">({profiles.length})</span>
        </div>
        <div className="space-y-1.5">
          {profiles.map((profile) => {
            const initials = `${profile.first_name[0]}${profile.last_name[0]}`;
            const isPlayer = section.key === "player";
            const isCoach = section.key === "coach";
            const cardClass = "flex items-center gap-3 rounded-xl bg-card border p-4";
            const inner = (
              <>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold shrink-0 ${
                    isCoach
                      ? "bg-amber-100 text-amber-700"
                      : isPlayer
                      ? "bg-blue-100 text-blue-700"
                      : "bg-green-100 text-green-700"
                  }`}
                >
                  {isPlayer && profile.shirt_number
                    ? profile.shirt_number
                    : initials}
                </div>
                <div className="flex-1 min-w-0">
                   <p className="font-semibold text-[15px]">
                     {profile.first_name} {profile.last_name}
                   </p>
                   <div className="flex items-center gap-1.5 flex-wrap">
                     <p className="text-sm text-muted-foreground">
                       {isPlayer
                         ? (profile.position || "Joueur")
                         : section.label.slice(0, -1)}
                     </p>
                     {isPlayer && muteStatuses[profile.id] === "mute" && (
                       <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                         Muté
                       </span>
                     )}
                     {isPlayer && muteStatuses[profile.id] === "mute_hors_periode" && (
                       <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                         Muté HP
                       </span>
                     )}
                   </div>
                 </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              </>
            );
            return (
              <div key={profile.id} className="flex items-stretch gap-0">
                <Link
                  href={`/stats/${profile.id}`}
                  className={`${cardClass} flex-1 min-w-0 active:scale-[0.98] transition-transform touch-manipulation`}
                >
                  {inner}
                </Link>
                {isPlayer && (userRole === "coach" || userRole === "owner") && (
                  <Link
                    href={`/chat?player=${profile.id}`}
                    className="flex items-center justify-center border border-l-0 bg-card px-3 text-[var(--color-royal)] hover:bg-muted/50"
                    aria-label="Discuter avec les parents"
                    title="Discuter avec les parents"
                  >
                    <MessageCircle className="h-5 w-5" />
                  </Link>
                )}
                {isOwner && profile.id !== user?.id && memberIds[profile.id] && (
                   <div className="flex items-center border border-l-0 bg-card rounded-r-xl px-2 gap-1">
                     <select
                       value={profile.role === "coach" ? "coach" : profile.role === "parent" ? "parent" : "player"}
                       onChange={async (e) => {
                         e.stopPropagation();
                         const newRole = e.target.value;
                         const supabase = createClient();
                         const { error } = await supabase
                           .from("team_members")
                           .update({ role: newRole })
                           .eq("id", memberIds[profile.id]);
                         if (error) {
                           toast.error("Impossible de modifier le rôle");
                           return;
                         }
                         toast.success(`Rôle modifié`);
                         setAllProfiles((prev) =>
                           prev.map((p) =>
                             p.id === profile.id ? { ...p, role: newRole as Profile["role"] } : p
                           )
                         );
                       }}
                       onClick={(e) => e.stopPropagation()}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs cursor-pointer"
                        title="Modifier le rôle"
                     >
                       <option value="player">Joueur</option>
                       <option value="coach">Coach</option>
                       <option value="parent">Parent</option>
                     </select>
                     {isPlayer && (
                       <select
                         value={muteStatuses[profile.id] ?? ""}
                         onChange={async (e) => {
                           e.stopPropagation();
                           const newMuteStatus = e.target.value || null;
                           const supabase = createClient();
                           const { error } = await supabase
                             .from("team_members")
                             .update({ mute_status: newMuteStatus })
                             .eq("id", memberIds[profile.id]);
                           if (error) {
                             toast.error("Impossible de modifier le statut de mutation");
                             return;
                           }
                           toast.success("Statut de mutation modifié");
                           setMuteStatuses((prev) => ({
                             ...prev,
                             [profile.id]: newMuteStatus,
                           }));
                         }}
                         onClick={(e) => e.stopPropagation()}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs cursor-pointer"
                          title="Modifier le statut de mutation"
                       >
                         <option value="">Non muté</option>
                         <option value="mute">Muté</option>
                         <option value="mute_hors_periode">Muté HP</option>
                       </select>
                     )}
                   </div>
                 )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="section-gap">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {players.length} joueur{players.length > 1 ? "s" : ""} &middot; {currentTeam.name}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canAddPlayer && (
            <button
              type="button"
              onClick={() => setAddDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          )}
          {(userRole === "coach" || userRole === "owner") && allProfiles.length > 0 && (
            <>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                CSV
              </button>
              <button
                type="button"
                onClick={exportPdf}
                disabled={exporting === "pdf"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary-blue)] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {exporting === "pdf" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                PDF
              </button>
            </>
          )}
        </div>
      </div>

      {allProfiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-muted-foreground/50" />
          </div>
          <h3 className="font-semibold text-lg">Aucun membre</h3>
          <p className="text-muted-foreground text-sm mt-1 max-w-xs">
            Invitez des joueurs via le code d&apos;invitation de l&apos;equipe.
          </p>
        </div>
      ) : (
        SECTIONS.map((section) => <RoleSection key={section.key} section={section} />)
      )}

      {/* Dialog ajout joueur */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un joueur</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPlayer} className="space-y-3 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Prénom *</label>
                <input
                  required
                  type="text"
                  value={addForm.firstName}
                  onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Prénom"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Nom *</label>
                <input
                  required
                  type="text"
                  value={addForm.lastName}
                  onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Nom"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Adresse email</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="hasEmail"
                    checked={!addForm.hasEmail}
                    onChange={() => setAddForm((f) => ({ ...f, hasEmail: false, email: "" }))}
                    className="accent-[var(--color-primary-blue)]"
                  />
                  Pas d&apos;email
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="hasEmail"
                    checked={addForm.hasEmail}
                    onChange={() => setAddForm((f) => ({ ...f, hasEmail: true }))}
                    className="accent-[var(--color-primary-blue)]"
                  />
                  A une adresse email
                </label>
              </div>
              {addForm.hasEmail && (
                <input
                  type="email"
                  required
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemple.com"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              )}
              {!addForm.hasEmail && (
                <p className="text-[11px] text-muted-foreground">
                  Un compte de service sera créé. L&apos;enfant pourra revendiquer son compte plus tard en ajoutant son email.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Date de naissance</label>
              <input
                type="date"
                value={addForm.dateOfBirth}
                onChange={(e) => setAddForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Poste</label>
                <select
                  value={addForm.position}
                  onChange={(e) => setAddForm((f) => ({ ...f, position: e.target.value }))}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                >
                  <option value="">— Poste —</option>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">N° maillot</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={addForm.shirtNumber}
                  onChange={(e) => setAddForm((f) => ({ ...f, shirtNumber: e.target.value }))}
                  placeholder="Ex : 10"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
              </div>
            </div>
            <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={addSaving}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={addSaving}
                className="bg-[var(--color-primary-blue)] text-white hover:bg-[var(--color-primary-blue)]/90"
              >
                {addSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer le joueur"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
