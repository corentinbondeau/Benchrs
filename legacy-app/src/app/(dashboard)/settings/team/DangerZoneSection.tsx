"use client";

import { useState } from "react";
import { useTeam } from "@/lib/team";
import { authFetch } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogOut, Trash2 } from "lucide-react";

interface DangerZoneSectionProps {
  isOwner: boolean;
}

export default function DangerZoneSection({ isOwner }: DangerZoneSectionProps) {
  const { currentTeam, refreshTeams, switchTeam, teams } = useTeam();
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);

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

  if (!currentTeam) return null;

  return (
    <>
      {/* Danger Zone — Owner */}
      {isOwner && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Zone dangereuse
            </CardTitle>
            <CardDescription>
              Supprimer l&apos;équipe entraîne la perte de toutes les données associées
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!deleting ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (window.confirm("Êtes-vous sûr de vouloir supprimer cette équipe ? Cette action est irréversible.")) {
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
                  if (window.confirm("Êtes-vous sûr de vouloir quitter cette équipe ? Vous pourrez la rejoindre à nouveau avec le code d'invitation.")) {
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
    </>
  );
}
