"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Shield, Bell } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useToast } from "@/hooks/use-toast";

const roleLabels = {
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const user = session?.user;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      toast({ title: "Erreur", description: "Remplissez tous les champs", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Erreur", description: "Minimum 8 caractères", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Mot de passe mis à jour" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast({ title: "Erreur", description: String(e), variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Paramètres</h2>
        <p className="text-muted-foreground mt-1">
          Gérez votre profil et vos préférences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user?.avatarUrl || undefined} />
              <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-lg font-bold">
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">
                {user?.firstName} {user?.lastName}
              </h3>
              <Badge
                variant="secondary"
                className="mt-1"
              >
                {roleLabels[user?.role || "player"]}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Apparence & Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Thème sombre</p>
              <p className="text-xs text-muted-foreground">
                Basculer entre le thème clair et sombre
              </p>
            </div>
            <ThemeToggle />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifications push</p>
              <p className="text-xs text-muted-foreground">
                Recevoir les alertes dans le navigateur
              </p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-[var(--royal)]">
              <span className="inline-block h-4 w-4 translate-x-6 rounded-full bg-white transition-transform" />
            </button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Emails de relance</p>
              <p className="text-xs text-muted-foreground">
                Rappels pour les convocations en attente
              </p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-[var(--royal)]">
              <span className="inline-block h-4 w-4 translate-x-6 rounded-full bg-white transition-transform" />
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mot de passe actuel</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Mot de passe actuel"
            />
          </div>
          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 caractères"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirmer le mot de passe</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Retapez le nouveau mot de passe"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !currentPassword || !newPassword}
          >
            {changingPassword ? "Mise à jour..." : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
