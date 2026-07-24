"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/lib/team";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Copy, RefreshCw, Users } from "lucide-react";
import type { TeamMember, Profile } from "@/types";

export default function TeamSettingsPage() {
  const { currentTeam, refreshTeams } = useTeam();
  const { user } = useAuth();
  const [members, setMembers] = useState<(TeamMember & { profile?: Profile })[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const supabase = createClient();

  const isOwner = user?.profile?.role === "coach" || members.some(
    (m) => m.user_id === user?.id && m.role === "owner"
  );

  useEffect(() => {
    if (!currentTeam) return;

    async function loadMembers() {
      const { data } = await supabase
        .from("team_members")
        .select("*, profile:profiles(*)")
        .eq("team_id", currentTeam!.id);

      setMembers(data || []);
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

  if (!currentTeam) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Aucune équipe sélectionnée</p>
            <a href="/create-team" className="text-sm text-[var(--color-royal)] hover:underline mt-2 inline-block">
              Créer une équipe
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Paramètres d&apos;équipe</h1>

      {/* Team info */}
      <Card>
        <CardHeader>
          <CardTitle>{currentTeam.club?.name || "Club"}</CardTitle>
          <CardDescription>{currentTeam.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Code d&apos;invitation</Label>
            <div className="flex gap-2">
              <Input
                value={currentTeam.invite_code}
                readOnly
                className="font-mono text-lg"
              />
              <Button variant="outline" size="icon" onClick={copyCode}>
                <Copy className={`h-4 w-4 ${copied ? "text-green-500" : ""}`} />
              </Button>
              {isOwner && (
                <Button variant="outline" size="icon" onClick={regenerateCode}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Partagez ce code pour que les joueurs rejoignent votre équipe
            </p>
          </div>
        </CardContent>
      </Card>

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
                  <div>
                    <p className="text-sm font-medium">
                      {member.profile?.first_name} {member.profile?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {member.role}
                    </p>
                  </div>
                  <span className="text-xs bg-muted px-2 py-1 rounded-full capitalize">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
