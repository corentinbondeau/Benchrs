"use client";

import { useState, useEffect, useCallback } from "react";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { authFetch } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  BadgeCheck,
  Building2,
  Copy,
  Globe,
  Loader2,
  RefreshCw,
  Users,
  Trash2,
  LogOut,
  Crown,
  X,
} from "lucide-react";
import { normalizeFffNumber } from "@/lib/clubs";
import type { TeamMember, Profile } from "@/types";

interface MembersSectionProps {
  isOwner: boolean;
}

export default function MembersSection({ isOwner }: MembersSectionProps) {
  const { currentTeam, refreshTeams } = useTeam();
  const { user } = useAuth();

  const [members, setMembers] = useState<(TeamMember & { profile?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubMembers, setClubMembers] = useState<{ id: string; user_id: string; role: string; profile?: Profile }[]>([]);
  const [clubTeamsList, setClubTeamsList] = useState<{ id: string; name: string }[]>([]);
  const [canManageClub, setCanManageClub] = useState(false);
  const [comiteInviteCode, setComiteInviteCode] = useState("");
  const [comiteCodeCopied, setComiteCodeCopied] = useState(false);
  const [regeneratingCode, setRegeneratingCode] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [clubIdentity, setClubIdentity] = useState<{ name: string; fff_number: string | null } | null>(null);
  const [clubPublic, setClubPublic] = useState<{
    is_public: boolean;
    public_slug: string | null;
    description: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  } | null>(null);
  const [clubAliases, setClubAliases] = useState<{ id: string; alias: string }[]>([]);
  const [fffInput, setFffInput] = useState("");
  const [publicSlugInput, setPublicSlugInput] = useState("");
  const [publicDescInput, setPublicDescInput] = useState("");
  const [publicEmailInput, setPublicEmailInput] = useState("");
  const [publicPhoneInput, setPublicPhoneInput] = useState("");
  const [savingPublic, setSavingPublic] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [savingFff, setSavingFff] = useState(false);
  const [addingAlias, setAddingAlias] = useState(false);

  const fetchMembers = useCallback(async (teamId: string) => {
    const supabase = createClient();
    const { data: rows } = await supabase.from("team_members").select("*").eq("team_id", teamId);
    if (!rows || rows.length === 0) return [];
    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await supabase.from("profiles").select("*").in("id", userIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, profile: profileMap.get(r.user_id) }));
  }, []);

  const loadClubData = useCallback(async (clubId: string) => {
    const supabase = createClient();
    const [membersRes, teamsRes, presidentRes, clubRes] = await Promise.all([
      supabase.from("club_members").select("id, user_id, role").eq("club_id", clubId),
      supabase.from("teams").select("id, name").eq("club_id", clubId),
      supabase.from("club_members").select("id").eq("club_id", clubId).eq("user_id", user?.id ?? "").eq("role", "president").maybeSingle(),
      supabase.from("clubs").select("created_by").eq("id", clubId).maybeSingle(),
    ]);
    const rows = membersRes.data || [];
    const userIds = rows.map((r) => r.user_id as string);
    const profilesRes = userIds.length
      ? await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds)
      : { data: [] };
    const profileMap = new Map(((profilesRes.data as Profile[]) || []).map((p) => [p.id, p]));
    return {
      members: rows.map((r) => ({ ...r, profile: profileMap.get(r.user_id as string) })),
      teams: teamsRes.data || [],
      canManage: !!presidentRes.data || clubRes.data?.created_by === user?.id,
    };
  }, [user?.id]);

  const loadClubIdentity = useCallback(async (clubId: string) => {
    const supabase = createClient();
    const [clubRes, aliasesRes] = await Promise.all([
      supabase.from("clubs").select("id, name, fff_number, is_public, public_slug, description, contact_email, contact_phone").eq("id", clubId).maybeSingle(),
      supabase.from("club_aliases").select("id, alias").eq("club_id", clubId).order("alias"),
    ]);
    return { club: clubRes.data ?? null, aliases: aliasesRes.data || [] };
  }, []);

  const fetchInviteCode = useCallback(async (clubId: string) => {
    const res = await authFetch("/api/clubs/invite-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.inviteCode as string) ?? null;
  }, []);

  useEffect(() => {
    if (!currentTeam) return;
    fetchMembers(currentTeam.id).then((rows) => {
      setMembers(rows);
      setLoading(false);
    });

    if (currentTeam.club_id) {
      loadClubData(currentTeam.club_id).then(({ members: m, teams: t, canManage }) => {
        setClubMembers(m);
        setClubTeamsList(t);
        setCanManageClub(canManage);
        if (canManage) {
          fetchInviteCode(currentTeam.club_id!).then((code) => {
            if (code) setComiteInviteCode(code);
          });
        }
      });
      loadClubIdentity(currentTeam.club_id).then(({ club, aliases }) => {
        setClubIdentity(club);
        setClubAliases(aliases);
        setFffInput(club?.fff_number ?? "");
        setClubPublic(
          club
            ? {
                is_public: Boolean((club as unknown as { is_public?: boolean }).is_public),
                public_slug: (club as unknown as { public_slug?: string | null }).public_slug ?? null,
                description: (club as unknown as { description?: string | null }).description ?? null,
                contact_email: (club as unknown as { contact_email?: string | null }).contact_email ?? null,
                contact_phone: (club as unknown as { contact_phone?: string | null }).contact_phone ?? null,
              }
            : null
        );
        setPublicSlugInput((club as unknown as { public_slug?: string | null }).public_slug ?? "");
        setPublicDescInput((club as unknown as { description?: string | null }).description ?? "");
        setPublicEmailInput((club as unknown as { contact_email?: string | null }).contact_email ?? "");
        setPublicPhoneInput((club as unknown as { contact_phone?: string | null }).contact_phone ?? "");
      });
    }
  }, [currentTeam, fetchMembers, loadClubData, loadClubIdentity, fetchInviteCode]);

  async function removeMember(memberId: string, memberName: string) {
    const supabase = createClient();
    const { error } = await supabase.from("team_members").delete().eq("id", memberId);
    if (error) toast.error("Erreur lors de la expulsion");
    else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success(`${memberName} a été retiré de l'équipe`);
    }
  }

  async function transferOwnership(memberId: string, memberName: string) {
    if (!currentTeam) return;
    const ok = window.confirm(`Transférer la propriété de l'équipe à ${memberName} ? Vous deviendrez coach.`);
    if (!ok) return;
    const res = await authFetch("/api/teams/transfer-ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: currentTeam.id, newOwnerId: memberId }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Erreur lors du transfert"); return; }
    toast.success(`Propriété transférée à ${memberName}`);
    await refreshTeams();
    if (currentTeam) {
      const rows = await fetchMembers(currentTeam.id);
      setMembers(rows);
      setLoading(false);
    }
  }

  async function refreshClubData() {
    if (!currentTeam?.club_id) return;
    const data = await loadClubData(currentTeam.club_id);
    setClubMembers(data.members);
    setClubTeamsList(data.teams);
    setCanManageClub(data.canManage);
    if (data.canManage) {
      const code = await fetchInviteCode(currentTeam.club_id);
      if (code) setComiteInviteCode(code);
    }
  }

  async function refreshClubIdentity() {
    if (!currentTeam?.club_id) return;
    const { club, aliases } = await loadClubIdentity(currentTeam.club_id);
    setClubIdentity(club);
    setClubAliases(aliases);
    setClubPublic(
      club
        ? {
            is_public: Boolean((club as unknown as { is_public?: boolean }).is_public),
            public_slug: (club as unknown as { public_slug?: string | null }).public_slug ?? null,
            description: (club as unknown as { description?: string | null }).description ?? null,
            contact_email: (club as unknown as { contact_email?: string | null }).contact_email ?? null,
            contact_phone: (club as unknown as { contact_phone?: string | null }).contact_phone ?? null,
          }
        : null
    );
  }

  async function regenerateInviteCode() {
    if (!currentTeam?.club_id || !comiteInviteCode) return;
    setRegeneratingCode(true);
    const res = await authFetch("/api/clubs/invite-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, regenerate: true }),
    });
    setRegeneratingCode(false);
    if (res.ok) {
      const data = await res.json();
      setComiteInviteCode(data.inviteCode ?? "");
      toast.success("Code d'invitation régénéré");
    } else {
      toast.error("Erreur lors de la régénération du code");
    }
  }

  async function copyInviteCode() {
    if (!comiteInviteCode) return;
    await navigator.clipboard.writeText(comiteInviteCode);
    setComiteCodeCopied(true);
    setTimeout(() => setComiteCodeCopied(false), 2000);
  }

  async function addClubMember() {
    if (!currentTeam?.club_id || !newMemberEmail.trim()) return;
    setAddingMember(true);
    const res = await authFetch("/api/clubs/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, email: newMemberEmail.trim(), role: "comite" }),
    });
    const data = await res.json();
    setAddingMember(false);
    if (!res.ok) { toast.error(data.error || "Erreur lors de l'ajout"); return; }
    setNewMemberEmail("");
    toast.success("Membre du comité ajouté");
    await refreshClubData();
  }

  async function removeClubMember(userId: string) {
    if (!currentTeam?.club_id) return;
    const res = await authFetch("/api/clubs/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, userId }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Erreur lors du retrait"); return; }
    toast.success("Membre retiré du comité");
    await refreshClubData();
  }

  async function changeClubMemberRole(userId: string, role: "president" | "comite") {
    if (!currentTeam?.club_id) return;
    const res = await authFetch("/api/clubs/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, userId, role }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Erreur lors du changement de rôle"); return; }
    toast.success(role === "president" ? "Promu président" : "Rétrogradé en comité");
    await refreshClubData();
  }

  async function saveFffNumber() {
    if (!currentTeam?.club_id) return;
    const fff = normalizeFffNumber(fffInput);
    if (!fff) { toast.error("Numéro d'affiliation FFF invalide (6 chiffres requis)"); return; }
    setSavingFff(true);
    const res = await authFetch("/api/clubs/identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, fffNumber: fff }),
    });
    const data = await res.json();
    setSavingFff(false);
    if (!res.ok) { toast.error(data.error || "Erreur lors de l'enregistrement"); return; }
    toast.success("Numéro d'affiliation FFF enregistré");
    setClubIdentity((prev) => (prev ? { ...prev, fff_number: fff } : prev));
  }

  async function addAlias() {
    if (!currentTeam?.club_id || !aliasInput.trim()) return;
    setAddingAlias(true);
    const res = await authFetch("/api/clubs/aliases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, alias: aliasInput.trim() }),
    });
    const data = await res.json();
    setAddingAlias(false);
    if (!res.ok) { toast.error(data.error || "Erreur lors de l'ajout"); return; }
    setAliasInput("");
    toast.success("Alias ajouté");
    await refreshClubIdentity();
  }

  async function removeAlias(alias: string) {
    if (!currentTeam?.club_id) return;
    const res = await authFetch("/api/clubs/aliases", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clubId: currentTeam.club_id, alias }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Erreur lors de la suppression"); return; }
    toast.success("Alias supprimé");
    await refreshClubIdentity();
  }

  async function savePublicClub() {
    if (!currentTeam?.club_id) return;
    const supabase = createClient();
    setSavingPublic(true);
    try {
      const slug = publicSlugInput.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const { error } = await supabase.from("clubs").update({
        is_public: true,
        public_slug: slug || null,
        description: publicDescInput.trim() || null,
        contact_email: publicEmailInput.trim() || null,
        contact_phone: publicPhoneInput.trim() || null,
      }).eq("id", currentTeam.club_id);
      if (error) throw error;
      setClubPublic((prev) => ({ ...prev, is_public: true, public_slug: slug || null, description: publicDescInput.trim() || null, contact_email: publicEmailInput.trim() || null, contact_phone: publicPhoneInput.trim() || null }));
      toast.success("Page publique mise à jour");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPublic(false);
    }
  }

  async function disablePublicClub() {
    if (!currentTeam?.club_id) return;
    const supabase = createClient();
    const { error } = await supabase.from("clubs").update({ is_public: false }).eq("id", currentTeam.club_id);
    if (error) { toast.error(error.message); return; }
    setClubPublic((prev) => (prev ? { ...prev, is_public: false } : prev));
    toast.success("Page publique masquée");
  }

  if (!currentTeam) return null;

  return (
    <>
      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Membres ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Chargement...</p>
          ) : members.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun membre</p>
          ) : (
            <div className="divide-y">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[var(--color-royal)] text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {member.profile?.first_name?.[0]}
                      {member.profile?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {member.profile?.first_name} {member.profile?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.role === "owner" ? "Coach principal" : member.role === "coach" ? "Coach" : member.role === "parent" ? "Parent" : "Joueur"}
                        {member.user_id === user?.id && " (vous)"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-muted px-2 py-1 rounded-full">
                      {member.role === "owner" ? "Coach principal" : member.role === "coach" ? "Coach" : member.role === "parent" ? "Parent" : "Joueur"}
                    </span>
                    {isOwner && member.user_id !== user?.id && member.role !== "owner" && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-[var(--color-gold)] hover:text-[var(--color-gold)]"
                          title="Transférer la propriété"
                          onClick={() => transferOwnership(member.user_id, `${member.profile?.first_name} ${member.profile?.last_name}`)}
                        >
                          <Crown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Retirer de l'équipe"
                          onClick={() => removeMember(member.id, `${member.profile?.first_name} ${member.profile?.last_name}`)}
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Identité du club */}
      {currentTeam.club_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5" />
              Identité du club
            </CardTitle>
            <CardDescription>
              Le numéro d&apos;affiliation FFF est la clé unique du club (6 chiffres) : deux équipes d&apos;un même club ne peuvent pas créer un doublon.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Numéro d&apos;affiliation FFF</Label>
              <div className="flex gap-2">
                <Input
                  value={fffInput}
                  onChange={(e) => setFffInput(e.target.value)}
                  placeholder="501234"
                  inputMode="numeric"
                  className="h-9 font-mono text-sm"
                  disabled={!canManageClub}
                />
                {canManageClub && (
                  <Button size="sm" className="bg-[var(--color-primary-blue)] text-white font-semibold h-9" disabled={savingFff} onClick={saveFffNumber}>
                    {savingFff ? <Loader2 className="h-4 w-4 animate-spin" /> : clubIdentity?.fff_number ? "Modifier" : "Enregistrer"}
                  </Button>
                )}
              </div>
              {clubIdentity?.fff_number ? (
                <p className="text-xs text-muted-foreground">Club enregistré sous le numéro {clubIdentity.fff_number}</p>
              ) : canManageClub ? (
                <p className="text-xs text-muted-foreground">Attribuez votre numéro FFF pour éviter les doublons de club.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Numéro non renseigné — demandez au président du club de le définir.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Autres façons d&apos;écrire le nom ({clubAliases.length})</Label>
              {clubAliases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun alias. Ajoutez les variantes du nom (ex. « ECC », « Etoile Camphin ») pour retrouver le club.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {clubAliases.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 text-xs bg-muted px-2 py-1 rounded-full">
                      {a.alias}
                      {canManageClub && (
                        <button type="button" className="text-muted-foreground hover:text-destructive" title="Supprimer" onClick={() => removeAlias(a.alias)}>
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {canManageClub && (
                <div className="flex gap-2">
                  <Input value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} placeholder="ECC" className="h-9 text-sm" />
                  <Button size="sm" variant="outline" className="h-9" disabled={addingAlias || !aliasInput.trim()} onClick={addAlias}>
                    {addingAlias ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page publique du club */}
      {currentTeam.club_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Page publique du club
            </CardTitle>
            <CardDescription>
              Une vitrine publique avec formulaire de demande d&apos;essai, partageable aux nouvelles familles (lien /c/&lt;slug&gt;).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Adresse de la page</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/c/</span>
                <Input value={publicSlugInput} onChange={(e) => setPublicSlugInput(e.target.value)} placeholder="ecc-camphin" className="h-9 font-mono text-sm" disabled={!canManageClub} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description du club</Label>
              <Textarea value={publicDescInput} onChange={(e) => setPublicDescInput(e.target.value)} className="text-sm" rows={2} disabled={!canManageClub} placeholder="Valeurs du club, équipes, encadrement, projets..." />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Email de contact</Label>
                <Input value={publicEmailInput} onChange={(e) => setPublicEmailInput(e.target.value)} className="h-9 text-sm" disabled={!canManageClub} placeholder="contact@club.fr" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Téléphone de contact</Label>
                <Input value={publicPhoneInput} onChange={(e) => setPublicPhoneInput(e.target.value)} className="h-9 text-sm" disabled={!canManageClub} placeholder="06 12 34 56 78" />
              </div>
            </div>
            {clubPublic?.is_public && clubPublic.public_slug && (
              <div className="rounded-lg bg-muted px-3 py-2 text-xs">
                <p className="font-semibold text-sm">Page en ligne</p>
                <p className="text-muted-foreground mt-0.5 break-all">
                  {`${typeof window !== "undefined" ? window.location.origin : ""}/c/${clubPublic.public_slug}`}
                </p>
              </div>
            )}
            {canManageClub && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="bg-[var(--color-primary-blue)] text-white font-semibold" disabled={savingPublic} onClick={savePublicClub}>
                  {savingPublic ? <Loader2 className="h-4 w-4 animate-spin" /> : clubPublic?.is_public ? "Mettre à jour" : "Activer la page"}
                </Button>
                {clubPublic?.is_public && (
                  <Button size="sm" variant="outline" onClick={disablePublicClub}>Masquer</Button>
                )}
              </div>
            )}
            {!canManageClub && (
              <p className="text-xs text-muted-foreground">Seul le président du club peut gérer la page publique.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Comité du club */}
      {currentTeam.club_id && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {currentTeam.club?.name || "Club"}
            </CardTitle>
            <CardDescription>
              {clubTeamsList.length > 0
                ? `Comité : ${clubTeamsList.length} équipe(s) dans le club (visibilité en lecture seule)`
                : "Comité du club"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {clubTeamsList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {clubTeamsList.map((t) => (
                  <span key={t.id} className="text-xs bg-muted px-2 py-1 rounded-full">{t.name}</span>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs">Comité ({clubMembers.length})</Label>
              {clubMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun membre du comité</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {clubMembers.map((cm) => (
                    <div key={cm.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{cm.profile?.first_name} {cm.profile?.last_name}</span>
                        {cm.user_id === user?.id && <span className="text-xs text-muted-foreground">(vous)</span>}
                        {cm.role === "president" ? (
                          <span className="flex items-center gap-1 text-xs text-[var(--color-gold)] font-medium" title="Président">
                            <Crown className="h-3.5 w-3.5" />
                            Président
                          </span>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">Comité</Badge>
                        )}
                      </div>
                      {canManageClub && cm.user_id !== user?.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[var(--color-gold)]"
                            title={cm.role === "president" ? "Rétrograder en comité" : "Promouvoir président"}
                            onClick={() => changeClubMemberRole(cm.user_id, cm.role === "president" ? "comite" : "president")}
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Retirer du comité" onClick={() => removeClubMember(cm.user_id)}>
                            <LogOut className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {canManageClub && (
              <div className="space-y-2">
                <Label className="text-xs">Ajouter un membre du comité (par email)</Label>
                <div className="flex gap-2">
                  <Input value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} placeholder="email@exemple.com" type="email" className="h-9 text-sm" />
                  <Button size="sm" className="bg-[var(--color-primary-blue)] text-white font-semibold h-9" disabled={addingMember} onClick={addClubMember}>
                    {addingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ajouter"}
                  </Button>
                </div>
              </div>
            )}
            {canManageClub && comiteInviteCode && (
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs">Code d&apos;invitation du comité</Label>
                <div className="flex gap-2">
                  <Input value={comiteInviteCode} readOnly className="h-9 text-sm font-mono" />
                  <Button size="sm" variant="outline" className="h-9 px-3" title="Copier le code" onClick={copyInviteCode}>
                    <Copy className={`h-4 w-4 ${comiteCodeCopied ? "text-green-500" : ""}`} />
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 px-3" title="Régénérer le code" disabled={regeneratingCode} onClick={regenerateInviteCode}>
                    <RefreshCw className={`h-4 w-4 ${regeneratingCode ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  À transmettre aux personnes qui rejoignent le comité à l&apos;inscription. La régénération invalide l&apos;ancien code.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
