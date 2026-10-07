"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserClubs } from "@/lib/useUserClubs";
import { ClubPageShell } from "@/components/club/ClubPageShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Network, Phone, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface StaffMember {
  id: string;
  team_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  role: "coach" | "owner" | "adjoint" | "delegue" | "physio" | "intendant" | "autre";
}

interface Category {
  team_id: string;
  team_name: string;
  staff: StaffMember[];
}

const STAFF_ROLES: { value: StaffMember["role"]; label: string }[] = [
  { value: "adjoint", label: "Adjoint" },
  { value: "delegue", label: "Délégué de plateau" },
  { value: "physio", label: "Soigneur / Physio" },
  { value: "intendant", label: "Intendant" },
  { value: "autre", label: "Autre support" },
];
const ROLE_LABEL: Record<StaffMember["role"], string> = {
  coach: "Entraîneur",
  owner: "Responsable",
  adjoint: "Adjoint",
  delegue: "Délégué de plateau",
  physio: "Soigneur / Physio",
  intendant: "Intendant",
  autre: "Support",
};

export default function ClubCategoriesPage() {
  const { user } = useAuth();
  const { clubs, loading: clubsLoading } = useUserClubs();
  const [requested, setRequested] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coachTeams, setCoachTeams] = useState<Set<string>>(new Set());

  const supabaseRef = useRef(createClient());

  const clubId =
    requested && clubs.some((c) => c.club_id === requested)
      ? requested
      : (clubs[0]?.club_id ?? null);
  const selectedClub = clubs.find((c) => c.club_id === clubId) ?? null;
  const isCommittee = selectedClub?.role != null;

  const [dialogTeam, setDialogTeam] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([]);
  const [pickUser, setPickUser] = useState("");
  const [pickRole, setPickRole] = useState<StaffMember["role"]>("adjoint");

  const load = useCallback(
    async (cid: string) => {
      const { data: teamsData } = await supabaseRef.current.from("teams").select("id, name").eq("club_id", cid);
      const teams = ((teamsData || []) as { id: string; name: string }[]).map((t) => ({ team_id: t.id, team_name: t.name }));
      if (teams.length === 0) return { categories: [] as Category[], coachTeams: new Set<string>() };
      const teamIds = teams.map((t) => t.team_id);

      // Encadrement titulaire (coach / owner) par équipe.
      const { data: coachData } = await supabaseRef.current
        .from("team_members")
        .select("team_id, role, profile:profiles!inner(id, first_name, last_name, phone)")
        .in("team_id", teamIds)
        .in("role", ["coach", "owner"]);
      const headByTeam = new Map<string, StaffMember[]>();
      for (const c of coachData || []) {
        const row = c as {
          team_id: string;
          role: string;
          profile: { id: string; first_name: string | null; last_name: string | null; phone: string | null }[];
        };
        const p = row.profile?.[0];
        const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Accueil";
        if (!headByTeam.has(row.team_id)) headByTeam.set(row.team_id, []);
        headByTeam.get(row.team_id)!.push({
          id: `tm-${row.team_id}-${row.role}`,
          team_id: row.team_id,
          user_id: p?.id || row.role,
          name,
          phone: p?.phone ?? null,
          role: row.role === "owner" ? "owner" : "coach",
        });
      }

      // Rôles spécifiques (adjoint, délégué…) par équipe.
      const { data: staffData } = await supabaseRef.current
        .from("club_staff_roles")
        .select("team_id, user_id, staff_role, profile:profiles!inner(id, first_name, last_name, phone)")
        .in("team_id", teamIds);
      const extraByTeam = new Map<string, StaffMember[]>();
      for (const s of staffData || []) {
        const row = s as {
          team_id: string;
          user_id: string;
          staff_role: string;
          profile: { first_name: string | null; last_name: string | null; phone: string | null }[];
        };
        const p = row.profile?.[0];
        const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Membre";
        if (!extraByTeam.has(row.team_id)) extraByTeam.set(row.team_id, []);
        extraByTeam.get(row.team_id)!.push({
          id: `sr-${row.team_id}-${row.user_id}`,
          team_id: row.team_id,
          user_id: row.user_id,
          name,
          phone: p?.phone ?? null,
          role: row.staff_role as StaffMember["role"],
        });
      }

      let coachTeams = new Set<string>();
      if (user) {
        const { data: mine } = await supabaseRef.current
          .from("team_members")
          .select("team_id")
          .eq("user_id", user.id)
          .in("team_id", teamIds)
          .in("role", ["coach", "owner"]);
        coachTeams = new Set(((mine || []) as { team_id: string }[]).map((m) => m.team_id));
      }

      const categories = teams.map((t) => ({
        ...t,
        staff: [...(headByTeam.get(t.team_id) ?? []), ...(extraByTeam.get(t.team_id) ?? [])],
      }));
      return { categories, coachTeams };
    },
    [user]
  );

  useEffect(() => {
    if (!clubId) return;
    load(clubId).then((res) => {
      setCategories(res.categories);
      setCoachTeams(res.coachTeams);
      setPageLoading(false);
    });
  }, [clubId, load]);

  function onChangeClub(id: string) {
    setRequested(id);
    setPageLoading(true);
  }

  const canManageTeam = (teamId: string) => isCommittee || coachTeams.has(teamId);

  async function openAdd(teamId: string) {
    setDialogTeam(teamId);
    setPickUser("");
    setPickRole("adjoint");
    const { data } = await supabaseRef.current
      .from("team_members")
      .select("user_id, profile:profiles!inner(first_name, last_name)")
      .eq("team_id", teamId);
    const current = new Set(
      (categories.find((c) => c.team_id === teamId)?.staff ?? []).map((s) => s.user_id)
    );
    const rows = ((data || []) as { user_id: string; profile: { first_name: string | null; last_name: string | null }[] }[])
      .map((r) => ({
        id: r.user_id,
        name: `${r.profile?.[0]?.first_name ?? ""} ${r.profile?.[0]?.last_name ?? ""}`.trim() || "Membre",
      }))
      .filter((r) => !current.has(r.id));
    setCandidates(rows.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i));
  }

  async function addStaff() {
    if (!dialogTeam || !pickUser) return;
    const { error } = await supabaseRef.current.from("club_staff_roles").insert({
      team_id: dialogTeam,
      user_id: pickUser,
      staff_role: pickRole,
    });
    if (error) {
      toast.error("Impossible d'ajouter ce responsable");
      return;
    }
    toast.success("Responsable ajouté");
    setDialogTeam(null);
    if (clubId) {
      load(clubId).then((res) => setCategories(res.categories));
    }
  }

  async function removeStaff(s: StaffMember) {
    const { error } = await supabaseRef.current
      .from("club_staff_roles")
      .delete()
      .eq("team_id", s.team_id)
      .eq("user_id", s.user_id);
    if (error) {
      toast.error("Impossible de retirer ce responsable");
      return;
    }
    if (clubId) {
      load(clubId).then((res) => setCategories(res.categories));
    }
  }

  return (
    <ClubPageShell
      title="Arbre des catégories"
      subtitle="Responsables et coordonnées par équipe"
      clubs={clubs}
      clubId={clubId}
      onChangeClub={onChangeClub}
      loading={clubsLoading || pageLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" />
          Imprimer
        </Button>
      }
    >
      <div className="space-y-4">
        {categories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Network className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">Aucune équipe pour ce club.</p>
            </CardContent>
          </Card>
        ) : (
          categories.map((cat) => (
            <Card key={cat.team_id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-lg">{cat.team_name}</p>
                  {canManageTeam(cat.team_id) && (
                    <Button size="sm" variant="outline" onClick={() => openAdd(cat.team_id)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Responsable
                    </Button>
                  )}
                </div>
                {cat.staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-1">Aucun responsable renseigné.</p>
                ) : (
                  <ul className="mt-2 divide-y">
                    {cat.staff.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{s.name}</span>
                          <Badge variant={s.role === "coach" || s.role === "owner" ? "default" : "secondary"}>
                            {ROLE_LABEL[s.role]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {s.phone && (
                            <a
                              href={`tel:${s.phone.replace(/\s/g, "")}`}
                              className="text-xs text-[var(--color-royal)] inline-flex items-center gap-1"
                            >
                              <Phone className="h-3 w-3" />
                              {s.phone}
                            </a>
                          )}
                          {canManageTeam(cat.team_id) && s.role !== "coach" && s.role !== "owner" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => removeStaff(s)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={!!dialogTeam} onOpenChange={() => setDialogTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un responsable</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Membre de l&apos;équipe</label>
              <Select value={pickUser} onValueChange={(v) => setPickUser(v ?? "")}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                  {candidates.length === 0 && <SelectItem value="__none__" disabled>Plus personne à ajouter</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Rôle</label>
              <Select value={pickRole} onValueChange={(v) => setPickRole(v as StaffMember["role"])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogTeam(null)}>
                Annuler
              </Button>
              <Button onClick={addStaff} disabled={!pickUser}>
                Ajouter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ClubPageShell>
  );
}