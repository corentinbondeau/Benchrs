"use client";

import { useState, useEffect } from "react";
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
import { Switch } from "@/components/ui/switch";
import { User, Shield, Bell, Save, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import {
  registerPushSubscription,
  unregisterPushSubscription,
  isPushSubscribed,
} from "@/components/PwaRegistrar";

const roleLabels = {
  coach: "Coach",
  player: "Joueur",
  parent: "Parent",
};

const positionOptions = [
  "Gardien",
  "Défenseur",
  "Milieu défensif",
  "Milieu offensif",
  "Ailier gauche",
  "Ailier droit",
  "Attaquant",
  "Buteur",
];

interface ProfileData {
  first_name: string;
  last_name: string;
  phone: string;
  date_of_birth: string;
  position: string;
  shirt_number: string;
  avatar_url: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const user = session?.user;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const [profile, setProfile] = useState<ProfileData>({
    first_name: "",
    last_name: "",
    phone: "",
    date_of_birth: "",
    position: "",
    shirt_number: "",
    avatar_url: "",
  });

  useEffect(() => {
    isPushSubscribed().then(setPushEnabled);
    if (user?.id) {
      const supabase = createClient();
      supabase
        .from("profiles")
        .select("first_name, last_name, phone, date_of_birth, position, shirt_number, avatar_url, email_notifications")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setProfile({
              first_name: data.first_name || "",
              last_name: data.last_name || "",
              phone: data.phone || "",
              date_of_birth: data.date_of_birth || "",
              position: data.position || "",
              shirt_number: data.shirt_number?.toString() || "",
              avatar_url: data.avatar_url || "",
            });
            setEmailEnabled(data.email_notifications ?? true);
          }
        });
    }
  }, [user?.id]);

  async function handlePushToggle(checked: boolean) {
    setPushLoading(true);
    try {
      if (checked) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast({ title: "Permission refusée", description: "Activez les notifications dans les paramètres du navigateur", variant: "destructive" });
          setPushLoading(false);
          return;
        }
        const ok = await registerPushSubscription();
        setPushEnabled(ok);
        if (ok) toast({ title: "Notifications activées" });
      } else {
        await unregisterPushSubscription();
        setPushEnabled(false);
        toast({ title: "Notifications désactivées" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de modifier les notifications", variant: "destructive" });
    } finally {
      setPushLoading(false);
    }
  }

  async function handleEmailToggle(checked: boolean) {
    setEmailEnabled(checked);
    if (user?.id) {
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({ email_notifications: checked })
        .eq("id", user.id);
      toast({ title: checked ? "Emails activés" : "Emails désactivés" });
    }
  }

  async function handleSaveProfile() {
    if (!user?.id) return;
    setSavingProfile(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: profile.first_name,
          last_name: profile.last_name,
          phone: profile.phone || null,
          date_of_birth: profile.date_of_birth || null,
          position: profile.position || null,
          shirt_number: profile.shirt_number ? parseInt(profile.shirt_number) : null,
          avatar_url: profile.avatar_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;
      toast({ title: "Profil mis à jour" });
    } catch (e) {
      toast({ title: "Erreur", description: String(e), variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  }

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
            Informations personnelles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile.avatar_url || undefined} />
              <AvatarFallback className="bg-[var(--royal)] text-[var(--royal-foreground)] text-lg font-bold">
                {profile.first_name?.[0]}
                {profile.last_name?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">
                  {profile.first_name} {profile.last_name}
                </h3>
                <Badge variant="secondary">
                  {roleLabels[user?.role || "player"]}
                </Badge>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Prénom *</Label>
              <Input
                id="first_name"
                value={profile.first_name}
                onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Nom *</Label>
              <Input
                id="last_name"
                value={profile.last_name}
                onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="06 12 34 56 78"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date de naissance</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={profile.date_of_birth}
                onChange={(e) => setProfile({ ...profile, date_of_birth: e.target.value })}
              />
            </div>
          </div>

          {(user?.role === "player" || user?.role === "coach") && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="position">Poste</Label>
                <select
                  id="position"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={profile.position}
                  onChange={(e) => setProfile({ ...profile, position: e.target.value })}
                >
                  <option value="">-- Choisir --</option>
                  {positionOptions.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shirt_number">Numéro de maillot</Label>
                <Input
                  id="shirt_number"
                  type="number"
                  min="1"
                  max="99"
                  value={profile.shirt_number}
                  onChange={(e) => setProfile({ ...profile, shirt_number: e.target.value })}
                  placeholder="Ex: 10"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="avatar_url">URL de l&apos;avatar</Label>
            <Input
              id="avatar_url"
              type="url"
              value={profile.avatar_url}
              onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={savingProfile || !profile.first_name || !profile.last_name}>
            {savingProfile ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enregistrement...</>
            ) : (
              <><Save className="h-4 w-4 mr-1" />Enregistrer les modifications</>
            )}
          </Button>
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
            <Switch
              checked={pushEnabled}
              onCheckedChange={handlePushToggle}
              disabled={pushLoading}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Emails de relance</p>
              <p className="text-xs text-muted-foreground">
                Rappels pour les convocations en attente
              </p>
            </div>
            <Switch
              checked={emailEnabled}
              onCheckedChange={handleEmailToggle}
            />
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
