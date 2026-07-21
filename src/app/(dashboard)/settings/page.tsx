"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { User, Shield } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { toast } from "sonner";

const roleLabels = { coach: "Coach", player: "Joueur", parent: "Parent" };

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Minimum 8 caracteres");
      return;
    }
    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Mot de passe mis a jour");
      setNewPassword("");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Parametres</h2>
        <p className="text-muted-foreground mt-1">Gerez votre profil et vos preferences</p>
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
              <AvatarFallback className="bg-[var(--color-royal)] text-white text-lg font-bold">
                {user?.profile?.first_name?.[0]}{user?.profile?.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">
                {user?.profile?.first_name} {user?.profile?.last_name}
              </h3>
              <Badge variant="secondary" className="mt-1">
                {roleLabels[user?.profile?.role || "player"]}
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Apparence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Theme sombre</p>
              <p className="text-xs text-muted-foreground">Basculer entre le theme clair et sombre</p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Securite
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 caracteres"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
            {changingPassword ? "Mise a jour..." : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Button variant="destructive" className="w-full" onClick={signOut}>
            Se deconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
