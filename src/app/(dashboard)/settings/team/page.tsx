"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "sonner";
import {
  Copy,
  Link2,
  Share2,
  RefreshCw,
  Users,
  Pencil,
  Trash2,
  Check,
  X,
  LogOut,
} from "lucide-react";
import type { TeamMember, Profile } from "@/types";

export default function TeamSettingsPage() {
  const { currentTeam, refreshTeams, switchTeam, teams } = useTeam();
  const { user } = useAuth();
  const router = useRouter();
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
  const supabase = createClient();

  const isOwner = members.some(
    (m) => m.user_id === user?.id && m.role === "owner"
  );

  useEffect(() => {
    if (!currentTeam) return;

    setNewName(currentTeam.name);
    setColorPrimary(currentTeam.color_primary || "#EAB308");
    setColorSecondary(currentTeam.color_secondary || "#1E40AF");

    async function loadMembers() {
      const { data: rows } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_id", currentTeam!.id);

      if (!rows || rows.length === 0) {
        setMembers([]);
        setLoading(false);
        return;
      }

      const userIds = rows.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.id, p])
      );

      setMembers(
        rows.map((r) => ({
          ...r,
          profile: profileMap.get(r.user_id),
        }))
      );
      setLoading(false);
    }

    loadMembers();
  }, [currentTeam, supabase]);

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
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() =>
                            removeMember(
                              member.id,
                              `${member.profile?.first_name} ${member.profile?.last_name}`
                            )
                          }
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
