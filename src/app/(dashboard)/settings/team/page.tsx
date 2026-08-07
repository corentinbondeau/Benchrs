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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Activity,
  Building2,
  CalendarDays,
  Copy,
  Download,
  Flame,
  Link2,
  Loader2,
  Share2,
  RefreshCw,
  Users,
  Pencil,
  Trash2,
  Check,
  X,
  LogOut,
  Crown,
} from "lucide-react";
import { CHALLENGE_DIFFICULTIES, type ChallengeDifficulty } from "@/lib/challenges/ai-generator";
import type { TeamMember, Profile } from "@/types";

export default function TeamSettingsPage() {
  const { currentTeam, refreshTeams, switchTeam, teams, userRole } = useTeam();
  const { user } = useAuth();
  const [members, setMembers] = useState<
    (TeamMember & { profile?: Profile })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [colorPrimary, setColorPrimary] = useState("#EAB308");
  const [colorSecondary, setColorSecondary] = useState("#1E40AF");
  const [savingColors, setSavingColors] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [difficulty, setDifficulty] = useState<ChallengeDifficulty>("moyen");
  const [savingDifficulty, setSavingDifficulty] = useState(false);
  const [enableRpe, setEnableRpe] = useState(false);
  const [savingRpe, setSavingRpe] = useState(false);
  const [icsInfo, setIcsInfo] = useState<{
    webcalUrl: string;
    icsUrl: string;
    downloadUrl: string;
    teamName: string;
  } | null>(null);
  const [icsCopied, setIcsCopied] = useState(false);
  const [clubMembers, setClubMembers] = useState<
    { id: string; user_id: string; role: string; profile?: Profile }[]
  >([]);
  const [clubTeamsList, setClubTeamsList] = useState<{ id: string; name: string }[]>([]);
  const [canManageClub, setCanManageClub] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const supabase = createClient();

  const isOwner = members.some(
    (m) => m.user_id === user?.id && m.role === "owner"
  );
  const isCoach = userRole === "coach" || userRole === "owner";

  const fetchMembers = useCallback(async (teamId: string) => {
    const supabase = createClient();
    const { data: rows } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId);

    if (!rows || rows.length === 0) return [];

    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);

    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      profile: profileMap.get(r.user_id),
    }));
  }, []);

  const loadClubData = useCallback(
    async (clubId: string) => {
      const supabase = createClient();
      const [membersRes, teamsRes, presidentRes, clubRes] = await Promise.all([
        supabase.from("club_members").select("id, user_id, role").eq("club_id", clubId),
        supabase.from("teams").select("id, name").eq("club_id", clubId),
        supabase
          .from("club_members")
          .select("id")
          .eq("club_id", clubId)
          .eq("user_id", user?.id ?? "")
          .eq("role", "president")
          .maybeSingle(),
        supabase.from("clubs").select("created_by").eq("id", clubId).maybeSingle(),
      ]);

      const rows = membersRes.data || [];
      const userIds = rows.map((r) => r.user_id as string);
      const profilesRes = userIds.length
        ? await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", userIds)
        : { data: [] };
      const profileMap = new Map(
        ((profilesRes.data as Profile[]) || []).map((p) => [p.id, p])
      );

      return {
        members: rows.map((r) => ({ ...r, profile: profileMap.get(r.user_id as string) })),
        teams: teamsRes.data || [],
        canManage: !!presidentRes.data || clubRes.data?.created_by === user?.id,
      };
    },
    [user?.id]
  );

  useEffect(() => {
    if (!currentTeam) return;

    const team = currentTeam;
    const supabase = createClient();

    fetchMembers(team.id).then((rows) => {
      setMembers(rows);
      setLoading(false);
      setNewName(team.name);
      setColorPrimary(team.color_primary || "#EAB308");
      setColorSecondary(team.color_secondary || "#1E40AF");
    });

    supabase
      .from("weekly_challenge_settings")
      .select("difficulty")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.difficulty) {
          setDifficulty(data.difficulty as ChallengeDifficulty);
        }
      });

    supabase
      .from("team_settings")
      .select("enable_rpe")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnableRpe(data?.enable_rpe === true);
      });

    if (userRole === "coach" || userRole === "owner") {
      authFetch(`/api/calendar/url?teamId=${team.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.webcalUrl) setIcsInfo(d);
        })
        .catch(() => {
          /* lien calendrier indisponible */
        });
    }

    if (team.club_id) {
      loadClubData(team.club_id).then(({ members, teams: t, canManage }) => {
        setClubMembers(members);
        setClubTeamsList(t);
        setCanManageClub(canManage);
      });
    }
  }, [currentTeam, fetchMembers, userRole, loadClubData]);

  async function regenerateCode() {
    if (!currentTeam) return;

    const newCode = Array.from({ length: 12 }, () =>
      Math.random().toString(36).charAt(2)
    ).join("");

    const { error } = await supabase
      .from("teams")
      .update({ invite_code: newCode })
      .eq("id", currentTeam!.id);

    if (error) {
      toast.error("Erreur lors de la régénération du code");
    } else {
      await refreshTeams();
      toast.success("Nouveau code généré !");
    }
  }

  function copyCode() {
    if (!currentTeam) return;
    navigator.clipboard.writeText(currentTeam.invite_code);
    setCopied(true);
    toast.success("Code copié !");
    setTimeout(() => setCopied(false), 2000);
  }

  function inviteLink() {
    if (!currentTeam) return "";
    return `${window.location.origin}/join?code=${currentTeam.invite_code}`;
  }

  function copyInviteLink() {
    if (!currentTeam) return;
    navigator.clipboard.writeText(inviteLink());
    setCopied(true);
    toast.success("Lien d'invitation copié !");
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareInviteLink() {
    if (!currentTeam) return;
    const text = `Rejoins mon équipe ${currentTeam.name} sur Benchrs : ${inviteLink()}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Invitation Benchrs", text });
        return;
      } catch {
        // fallback sur copie si partage annulé/indisponible
      }
    }
    copyInviteLink();
  }

  async function saveTeamName() {
    if (!currentTeam || !newName.trim()) return;

    const { error } = await supabase
      .from("teams")
      .update({ name: newName.trim() })
      .eq("id", currentTeam!.id);

    if (error) {
      toast.error("Erreur lors de la mise à jour");
    } else {
      await refreshTeams();
      setEditingName(false);
      toast.success("Nom mis à jour !");
    }
  }

  async function saveColors() {
    if (!currentTeam) return;
    setSavingColors(true);

    const { error } = await supabase
      .from("teams")
      .update({ color_primary: colorPrimary, color_secondary: colorSecondary })
      .eq("id", currentTeam!.id);

    if (error) {
      toast.error("Erreur lors de la sauvegarde des couleurs");
    } else {
      await refreshTeams();
      toast.success("Couleurs mises à jour !");
    }
    setSavingColors(false);
  }

  async function deleteTeam() {
    if (!currentTeam) return;
    setDeleting(true);

    const res = await authFetch("/api/teams/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: currentTeam.id }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Erreur lors de la suppression");
      setDeleting(false);
      return;
    }

    toast.success("Équipe supprimée");
    await refreshTeams();

    if (teams.length > 1) {
      const remaining = teams.filter((t) => t.id !== currentTeam.id);
      switchTeam(remaining[0].id);
      window.location.href = "/settings/team";
    } else {
      window.location.href = "/create-team";
    }
  }

  async function removeMember(memberId: string, memberName: string) {
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast.error("Erreur lors de la expulsion");
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success(`${memberName} a été retiré de l'équipe`);
    }
  }

  async function transferOwnership(memberId: string, memberName: string) {
    if (!currentTeam) return;
    const ok = window.confirm(
      `Transférer la propriété de l'équipe à ${memberName} ? Vous deviendrez coach.`
    );
    if (!ok) return;

    const res = await authFetch("/api/teams/transfer-ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: currentTeam.id, newOwnerId: memberId }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Erreur lors du transfert");
      return;
    }

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
  }

  async function addClubMember() {
    if (!currentTeam?.club_id || !newMemberEmail.trim()) return;
    setAddingMember(true);
    const res = await authFetch("/api/clubs/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clubId: currentTeam.club_id,
        email: newMemberEmail.trim(),
        role: "comite",
      }),
    });
    const data = await res.json();
    setAddingMember(false);
    if (!res.ok) {
      toast.error(data.error || "Erreur lors de l'ajout");
      return;
    }
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
    if (!res.ok) {
      toast.error(data.error || "Erreur lors du retrait");
      return;
    }
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
    if (!res.ok) {
      toast.error(data.error || "Erreur lors du changement de rôle");
      return;
    }
    toast.success(role === "president" ? "Promu président" : "Rétrogradé en comité");
    await refreshClubData();
  }

  async function leaveTeam() {
    if (!currentTeam) return;
    setLeaving(true);

    const res = await authFetch("/api/team/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: currentTeam.id }),
    });
    const data = await res.json();

    if (!res.ok) {
      toast.error(data.error || "Erreur lors de la sortie de l'équipe");
      setLeaving(false);
      return;
    }

    toast.success("Vous avez quitté l'équipe");
    await refreshTeams();

    if (teams.length > 1) {
      const remaining = teams.filter((t) => t.id !== currentTeam.id);
      switchTeam(remaining[0].id);
      window.location.href = "/";
    } else {
      window.location.href = "/create-team";
    }
  }

  if (!currentTeam) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Aucune équipe sélectionnée</p>
            <a
              href="/create-team"
              className="text-sm text-[var(--color-royal)] hover:underline mt-2 inline-block"
            >
              Créer une équipe
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 md:space-y-6 pb-20 md:pb-0">
      <h1 className="text-xl md:text-2xl font-bold">Paramètres d&apos;équipe</h1>

      {/* Team Info + Invite Code */}
      <Card>
        <CardHeader>
          <CardTitle>{currentTeam.club?.name || "Club"}</CardTitle>
          <CardDescription>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTeamName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNewName(currentTeam.name);
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={saveTeamName}
                >
                  <Check className="h-4 w-4 text-green-500" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditingName(false);
                    setNewName(currentTeam.name);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <span className="flex items-center gap-2">
                {currentTeam.name}
                {isOwner && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setEditingName(true)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Lien d&apos;invitation</Label>
            <div className="flex gap-2">
              <Input
                value={inviteLink()}
                readOnly
                className="font-mono text-sm"
              />
              <Button variant="outline" size="icon" onClick={copyInviteLink}>
                <Copy
                  className={`h-4 w-4 ${copied ? "text-green-500" : ""}`}
                />
              </Button>
              <Button variant="outline" size="icon" onClick={shareInviteLink}>
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
            <Button
              className="w-full bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
              onClick={copyInviteLink}
            >
              <Link2 className="h-4 w-4 mr-1" />
              {copied ? "Lien copié !" : "Copier le lien d'invitation"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Partagez ce lien pour que les joueurs rejoignent l&apos;équipe en
              un clic, plus besoin de saisir le code à la main.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Code d&apos;invitation</Label>
            <div className="flex gap-2">
              <Input
                value={currentTeam.invite_code}
                readOnly
                className="font-mono text-lg"
              />
              <Button variant="outline" size="icon" onClick={copyCode}>
                <Copy className="h-4 w-4" />
              </Button>
              {isOwner && (
                <Button variant="outline" size="icon" onClick={regenerateCode}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Code alternatif à saisir manuellement sur la page de rejointe
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Personnalisation</CardTitle>
            <CardDescription>
              Configurez les couleurs de l&apos;interface pour toute
              l&apos;équipe
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Couleur principale</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colorPrimary}
                    onChange={(e) => setColorPrimary(e.target.value)}
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={colorPrimary}
                    onChange={(e) => setColorPrimary(e.target.value)}
                    className="font-mono h-10"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Boutons CTA, highlights
                </p>
              </div>
              <div className="space-y-2">
                <Label>Couleur secondaire</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colorSecondary}
                    onChange={(e) => setColorSecondary(e.target.value)}
                    className="h-10 w-10 rounded border cursor-pointer"
                  />
                  <Input
                    value={colorSecondary}
                    onChange={(e) => setColorSecondary(e.target.value)}
                    className="font-mono h-10"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Sidebar, accents, liens
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={saveColors}
                disabled={savingColors}
                className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
              >
                {savingColors ? "Sauvegarde..." : "Sauvegarder les couleurs"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setColorPrimary("#EAB308");
                  setColorSecondary("#1E40AF");
                }}
              >
                Réinitialiser
              </Button>
            </div>
            <div className="rounded-lg border p-3 flex items-center gap-4 bg-muted/50">
              <div
                className="h-10 w-10 rounded-lg"
                style={{ backgroundColor: colorPrimary }}
              />
              <div
                className="h-10 w-10 rounded-lg"
                style={{ backgroundColor: colorSecondary }}
              />
              <span className="text-sm text-muted-foreground">Aperçu</span>
            </div>
          </CardContent>
        </Card>
      )}

      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5" />
              Défi de la semaine
            </CardTitle>
            <CardDescription>
              Difficulté du défi généré automatiquement chaque semaine par IA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1 rounded-lg border p-0.5 w-fit">
              {CHALLENGE_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    difficulty === d
                      ? "bg-[var(--color-navy)] text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              disabled={savingDifficulty}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingDifficulty(true);
                const { error } = await supabase
                  .from("weekly_challenge_settings")
                  .upsert(
                    {
                      team_id: currentTeam.id,
                      difficulty,
                      updated_by: user?.id ?? null,
                    },
                    { onConflict: "team_id" }
                  );
                setSavingDifficulty(false);
                if (error) {
                  toast.error("Erreur lors de l'enregistrement");
                } else {
                  toast.success("Difficulté mise à jour");
                }
              }}
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Suivi de charge (RPE)
            </CardTitle>
            <CardDescription>
              Les joueurs notent l&apos;intensité perçue (1-10) après chaque séance pour suivre la
              charge d&apos;entraînement et prévenir les blessures.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Activer le suivi</p>
                <p className="text-xs text-muted-foreground">
                  Affiche la carte « Suivi de charge » sur les fiches d&apos;entraînement.
                </p>
              </div>
              <Switch
                checked={enableRpe}
                onCheckedChange={(v) => setEnableRpe(v === true)}
              />
            </div>
            <Button
              size="sm"
              disabled={savingRpe}
              onClick={async () => {
                if (!currentTeam) return;
                setSavingRpe(true);
                const { error } = await supabase
                  .from("team_settings")
                  .upsert(
                    {
                      team_id: currentTeam.id,
                      enable_rpe: enableRpe,
                      updated_by: user?.id ?? null,
                    },
                    { onConflict: "team_id" }
                  );
                setSavingRpe(false);
                if (error) {
                  toast.error("Erreur lors de l'enregistrement");
                } else {
                  toast.success("Paramètre enregistré");
                }
              }}
              className="bg-[var(--color-gold)] text-[var(--color-navy)] hover:bg-[var(--color-gold)]/90 font-semibold"
            >
              Enregistrer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Synchronisation calendrier */}
      {isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Synchronisation calendrier
            </CardTitle>
            <CardDescription>
              Abonnez-vous au calendrier de l&apos;équipe dans Google Calendar ou Apple Calendar :
              les matchs et entraînements apparaissent automatiquement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!icsInfo ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du lien...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Lien d&apos;abonnement (webcal)</Label>
                  <div className="flex gap-2">
                    <Input value={icsInfo.webcalUrl} readOnly className="font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(icsInfo.webcalUrl);
                          setIcsCopied(true);
                          setTimeout(() => setIcsCopied(false), 1500);
                        } catch {
                          toast.error("Copie impossible");
                        }
                      }}
                    >
                      <Copy className={`h-4 w-4 ${icsCopied ? "text-green-500" : ""}`} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            text: `Abonnez-vous au calendrier de ${icsInfo.teamName} (Benchrs)`,
                            url: icsInfo.webcalUrl,
                          });
                        } catch {
                          /* partage annulé */
                        }
                      } else {
                        window.open(icsInfo.webcalUrl, "_blank");
                      }
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5 mr-1" />
                    Partager
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(icsInfo.downloadUrl, "_blank")}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Télécharger .ics
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Google Calendar : Paramètres → Ajouter depuis une URL puis collez le lien.
                  Apple Calendar : Fichier → Nouvel abonnement au calendrier.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

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
                <div
                  key={member.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-[var(--color-royal)] text-white flex items-center justify-center text-sm font-bold shrink-0">
                      {member.profile?.first_name?.[0]}
                      {member.profile?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {member.profile?.first_name}{" "}
                        {member.profile?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {member.role}
                        {member.user_id === user?.id && " (vous)"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-muted px-2 py-1 rounded-full capitalize">
                      {member.role}
                    </span>
                    {isOwner &&
                      member.user_id !== user?.id &&
                      member.role !== "owner" && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-[var(--color-gold)] hover:text-[var(--color-gold)]"
                            title="Transférer la propriété"
                            onClick={() =>
                              transferOwnership(
                                member.user_id,
                                `${member.profile?.first_name} ${member.profile?.last_name}`
                              )
                            }
                          >
                            <Crown className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Retirer de l'équipe"
                            onClick={() =>
                              removeMember(
                                member.id,
                                `${member.profile?.first_name} ${member.profile?.last_name}`
                              )
                            }
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
                  <span
                    key={t.id}
                    className="text-xs bg-muted px-2 py-1 rounded-full"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">
                Comité ({clubMembers.length})
              </Label>
              {clubMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun membre du comité
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {clubMembers.map((cm) => (
                    <div
                      key={cm.id}
                      className="flex items-center justify-between px-3 py-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {cm.profile?.first_name} {cm.profile?.last_name}
                        </span>
                        {cm.user_id === user?.id && (
                          <span className="text-xs text-muted-foreground">
                            (vous)
                          </span>
                        )}
                        {cm.role === "president" ? (
                          <span
                            className="flex items-center gap-1 text-xs text-[var(--color-gold)] font-medium"
                            title="Président"
                          >
                            <Crown className="h-3.5 w-3.5" />
                            Président
                          </span>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            Comité
                          </Badge>
                        )}
                      </div>
                      {canManageClub && cm.user_id !== user?.id && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[var(--color-gold)]"
                            title={
                              cm.role === "president"
                                ? "Rétrograder en comité"
                                : "Promouvoir président"
                            }
                            onClick={() =>
                              changeClubMemberRole(
                                cm.user_id,
                                cm.role === "president" ? "comite" : "president"
                              )
                            }
                          >
                            <Crown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Retirer du comité"
                            onClick={() => removeClubMember(cm.user_id)}
                          >
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
                <Label className="text-xs">
                  Ajouter un membre du comité (par email)
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    type="email"
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    className="bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold h-9"
                    disabled={addingMember}
                    onClick={addClubMember}
                  >
                    {addingMember ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Ajouter"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      {isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Zone dangereuse
            </CardTitle>
            <CardDescription>
              Supprimer l&apos;équipe entraîne la perte de toutes les données
              associées
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!deleting ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      "Êtes-vous sûr de vouloir supprimer cette équipe ? Cette action est irréversible."
                    )
                  ) {
                    deleteTeam();
                  }
                }}
              >
                Supprimer l&apos;équipe
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Suppression...</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quitter l'équipe (non-owner) */}
      {!isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <LogOut className="h-5 w-5" />
              Quitter l&apos;équipe
            </CardTitle>
            <CardDescription>
              Vous perdrez l&apos;accès aux données de cette équipe
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!leaving ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      "Êtes-vous sûr de vouloir quitter cette équipe ? Vous pourrez la rejoindre à nouveau avec le code d'invitation."
                    )
                  ) {
                    leaveTeam();
                  }
                }}
              >
                Quitter l&apos;équipe
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Départ...</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
