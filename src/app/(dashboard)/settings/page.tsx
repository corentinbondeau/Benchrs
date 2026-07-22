"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  User,
  Palette,
  Shield,
  Bell,
  Save,
  Loader2,
} from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { toast } from "sonner";
import type { Profile } from "@/types";

const roleLabels = { coach: "Coach", player: "Joueur", parent: "Parent" };

const positions = [
  "Gardien",
  "Défenseur central",
  "Latéral droit",
  "Latéral gauche",
  "Milieu défensif",
  "Milieu central",
  "Milieu offensif",
  "Ailier droit",
  "Ailier gauche",
  "Buteur",
];

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);

  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (user?.profile) {
      const p = user.profile as Profile;
      setFirstName(p.first_name || "");
      setLastName(p.last_name || "");
      setPhone(p.phone || "");
      setPosition(p.position || "");
      setShirtNumber(p.shirt_number?.toString() || "");
      setDateOfBirth(p.date_of_birth || "");
      setEmailNotifications(p.email_notifications ?? true);
    }
  }, [user]);

  const hasProfileChanges =
    user?.profile &&
    (firstName !== (user.profile as Profile).first_name ||
      lastName !== (user.profile as Profile).last_name ||
      phone !== ((user.profile as Profile).phone || "") ||
      position !== ((user.profile as Profile).position || "") ||
      shirtNumber !== ((user.profile as Profile).shirt_number?.toString() || "") ||
      dateOfBirth !== ((user.profile as Profile).date_of_birth || "") ||
      emailNotifications !== ((user.profile as Profile).email_notifications ?? true));

  async function handleSaveProfile() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Le prénom et le nom sont requis");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          position: position || null,
          shirt_number: shirtNumber ? parseInt(shirtNumber) : null,
          date_of_birth: dateOfBirth || null,
          email_notifications: emailNotifications,
        })
        .eq("id", user!.id);
      if (error) throw error;
      toast.success("Profil mis à jour");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!newPassword || newPassword.length < 8) {
      toast.error("Minimum 8 caractères");
      return;
    }
    setChangingPassword(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Mot de passe mis à jour");
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
        <h2 className="text-2xl font-bold">Paramètres</h2>
        <p className="text-muted-foreground mt-1">Gérez votre profil et vos préférences</p>
      </div>

      {/* Profile card */}
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
                {firstName?.[0]}{lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-lg">
                {firstName} {lastName}
              </h3>
              <Badge variant="secondary" className="mt-1">
                {roleLabels[user?.profile?.role || "player"]}
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">{user?.email}</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="06 12 34 56 78"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">Date de naissance</Label>
              <Input
                id="dateOfBirth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Poste</Label>
              <select
                id="position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Aucun</option>
                {positions.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shirtNumber">Numéro de maillot</Label>
              <Input
                id="shirtNumber"
                type="number"
                min={1}
                max={99}
                value={shirtNumber}
                onChange={(e) => setShirtNumber(e.target.value)}
                placeholder="10"
              />
            </div>
          </div>

          {hasProfileChanges && (
            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Notifications par email</p>
              <p className="text-xs text-muted-foreground">
                Recevoir les convocations et rappels par email
              </p>
            </div>
            <Switch
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
            />
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Apparence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Thème sombre</p>
              <p className="text-xs text-muted-foreground">
                Basculer entre le thème clair et sombre
              </p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nouveau mot de passe</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 caractères"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
            {changingPassword ? "Mise à jour..." : "Changer le mot de passe"}
          </Button>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card>
        <CardContent className="pt-6">
          <Button variant="destructive" className="w-full" onClick={signOut}>
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
